"""
Portfolio Performance Service

Calculates historical portfolio value over time by reconstructing
daily positions from transactions and fetching historical prices.
"""
import yfinance as yf
import pandas as pd
import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import List, Dict, Optional

from app.core.supabase import supabase
from app.core.redis import get_redis
from app.services.exchange import exchange_service
from app.services.options_accounting import calculate_option_accounting
from app.services.portfolio_accounting import (
    HoldingCalculation,
    calculate_stock_holding_history,
    transaction_net_cashflow_czk,
)
from app.core.cache import CacheTTL
from app.services.market.yahoo import run_yahoo
from app.schemas.performance import PerformancePoint, PerformanceResult

logger = logging.getLogger(__name__)

# Periods that are a fixed number of days back; MTD, YTD and ALL are resolved by _period_start_date
_PERIOD_DAYS = {
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
}


def _period_start_date(period: str, today: date, first_tx_date: date) -> date:
    """First day shown for a named period; an unknown period falls back to one year."""
    if period == "YTD":
        return today.replace(month=1, day=1)
    if period == "MTD":
        return today.replace(day=1)
    if period == "ALL":
        return first_tx_date
    return today - timedelta(days=_PERIOD_DAYS.get(period, 365))


def _download_closes_sync(tickers: tuple, start: date, end: date) -> pd.DataFrame:
    # Unadjusted, like every other price in the app (adjusted closes would understate the past)
    return yf.download(list(tickers), start=start, end=end, progress=False, auto_adjust=False)


@dataclass(frozen=True)
class StockSeriesPoint:
    date: str
    value_czk: float  # market value of the shares held
    cost_basis_czk: float  # cost of the shares held (FIFO / chosen lots), as on the Přehled
    net_cashflow_czk: float  # cumulative cash moved: negative = money put in, positive = taken out


def _build_stock_series(
    transactions: List[dict],
    close_prices: pd.DataFrame,
    ticker_info: Dict[str, dict],
    rates: Dict[str, float],
    display_start_date: date,
) -> List[StockSeriesPoint]:
    """Daily market value, cost basis and cumulative cashflow (CZK) over the trading days in `close_prices`.

    Each (portfolio, stock) position is accounted separately with the same lot logic as
    the holdings table, so the cost basis on any day is what the Přehled would have shown.
    Every transaction dated on or before a trading day is applied by that day, so a trade
    on a weekend or holiday takes effect on the next trading day. Days before the first
    transaction are skipped. Pure function: no network, cache or database access.
    """
    by_position: Dict[tuple, List[dict]] = {}
    for tx in sorted(
        transactions,
        key=lambda item: (item["executed_at"], item.get("created_at") or "", item.get("id") or ""),
    ):
        by_position.setdefault((tx["portfolio_id"], tx["stock_id"]), []).append(tx)

    # One event per transaction: the position's state right after it, and the cash it moved
    events = []
    for position_key, position_transactions in by_position.items():
        history = calculate_stock_holding_history(position_transactions)
        for tx, holding in zip(position_transactions, history):
            day = pd.to_datetime(tx["executed_at"]).date().isoformat()
            events.append((day, position_key, tx["stocks"]["ticker"], holding, transaction_net_cashflow_czk(tx)))
    events.sort(key=lambda event: event[0])  # stable: keeps each position's own order

    holdings: Dict[tuple, HoldingCalculation] = {}  # position -> its state after the latest applied transaction
    tickers: Dict[tuple, str] = {}
    net_cashflow_czk = 0.0
    applied = 0
    series: List[StockSeriesPoint] = []

    for trading_day in close_prices.index.tolist():
        date_str = trading_day.date().isoformat()

        # Apply every transaction not yet applied up to and including this day
        while applied < len(events) and events[applied][0] <= date_str:
            _, position_key, ticker, holding, cashflow = events[applied]
            holdings[position_key] = holding
            tickers[position_key] = ticker
            net_cashflow_czk += cashflow
            applied += 1

        if applied == 0 or trading_day.date() < display_start_date:
            continue

        shares_by_ticker: Dict[str, float] = {}
        for position_key, holding in holdings.items():
            shares_by_ticker[tickers[position_key]] = shares_by_ticker.get(tickers[position_key], 0.0) + holding.shares

        value_czk = 0.0
        for ticker, shares in shares_by_ticker.items():
            if shares > 0 and ticker in close_prices.columns:
                price = close_prices.loc[trading_day, ticker]
                if pd.notna(price):
                    # Apply price scale for LSE stocks
                    info = ticker_info.get(ticker, {})
                    scale = info.get("price_scale", 1) or 1
                    rate = rates.get(info.get("currency", "USD"), 23.5)
                    value_czk += shares * float(price) * scale * rate

        series.append(StockSeriesPoint(
            date=date_str,
            value_czk=value_czk,
            cost_basis_czk=sum(holding.total_invested_czk for holding in holdings.values()),
            net_cashflow_czk=net_cashflow_czk,
        ))

    return series


def _period_return(first: StockSeriesPoint, last: StockSeriesPoint) -> tuple[float, float]:
    """Return (amount in CZK, percent of starting value) between two points of the series.

    Return = change of value minus the money put in during the period, so realized
    profit counts as well as unrealized profit.
    """
    money_put_in = -(last.net_cashflow_czk - first.net_cashflow_czk)
    total_return = last.value_czk - first.value_czk - money_put_in
    # Percentage is based on the starting portfolio value (close to time-weighted return)
    total_return_pct = (total_return / first.value_czk * 100) if first.value_czk > 0 else 0.0
    return total_return, total_return_pct


async def get_stock_performance(
    user_id: str,
    portfolio_id: Optional[str] = None,
    period: str = "1Y",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
) -> PerformanceResult:
    """
    Calculate stock portfolio performance over time.
    
    Args:
        user_id: User ID for authentication
        portfolio_id: Optional portfolio ID, None for all portfolios
        period: Time period (1W, 1M, 3M, 6M, MTD, YTD, 1Y, ALL)
        from_date: Custom start date (YYYY-MM-DD), overrides period
        to_date: Custom end date (YYYY-MM-DD), overrides period
    
    Returns:
        PerformanceResult with daily values, invested amounts, and benchmark
    """
    redis = get_redis()
    
    # Cache key - include custom dates
    cache_key = f"perf:stock:v2:{user_id}:{portfolio_id or 'all'}:{period}:{from_date or ''}:{to_date or ''}"
    
    logger.info(f"[PERF] Request: portfolio_id={portfolio_id}, period={period}, from={from_date}, to={to_date}")
    
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        logger.info(f"[PERF] Cache hit for {cache_key}, data points: {len(data.get('data', []))}")
        return PerformanceResult(**data)
    
    # 1. Get transactions
    query = supabase.table("transactions") \
        .select("*, stocks(ticker, currency, price_scale)") \
        .order("executed_at", desc=False)
    
    if portfolio_id:
        # Get portfolio and verify ownership
        portfolio = supabase.table("portfolios") \
            .select("id") \
            .eq("id", portfolio_id) \
            .eq("user_id", user_id) \
            .execute()
        if not portfolio.data:
            logger.info(f"[PERF] Portfolio {portfolio_id} not found or not owned by user")
            return PerformanceResult(data=[], total_return=0, total_return_pct=0)
        query = query.eq("portfolio_id", portfolio_id)
    else:
        # Get all user's portfolios
        portfolios = supabase.table("portfolios") \
            .select("id") \
            .eq("user_id", user_id) \
            .execute()
        portfolio_ids = [p["id"] for p in portfolios.data]
        if not portfolio_ids:
            logger.info(f"[PERF] No portfolios found for user")
            return PerformanceResult(data=[], total_return=0, total_return_pct=0)
        query = query.in_("portfolio_id", portfolio_ids)
    
    transactions = query.execute().data
    logger.info(f"[PERF] Found {len(transactions)} stock transactions for portfolio_id={portfolio_id}")
    if not transactions:
        logger.info(f"[PERF] No transactions - returning empty result")
        return PerformanceResult(data=[], total_return=0, total_return_pct=0)
    
    # 2. Determine date range for DISPLAY (chart output)
    first_tx_date = pd.to_datetime(transactions[0]["executed_at"]).date()
    today = datetime.now().date()
    
    # Custom date range takes priority
    if from_date:
        display_start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
    else:
        display_start_date = _period_start_date(period, today, first_tx_date)
    
    # Custom end date
    end_date = datetime.strptime(to_date, "%Y-%m-%d").date() if to_date else today
    
    # Display cannot start before first transaction
    display_start_date = max(display_start_date, first_tx_date)
    
    # IMPORTANT: Always fetch prices from first transaction to build positions correctly
    fetch_start_date = first_tx_date
    
    # 3. Get unique tickers
    tickers = list(set(tx["stocks"]["ticker"] for tx in transactions))
    ticker_info = {tx["stocks"]["ticker"]: tx["stocks"] for tx in transactions}
    
    # 4. Fetch historical prices (single batch call)
    # Fetch from first transaction to have complete position history
    try:
        hist_data = await run_yahoo(
            _download_closes_sync, tuple(tickers), fetch_start_date, end_date + timedelta(days=1)
        )
        
        if hist_data.empty:
            logger.info(f"[PERF] yfinance returned empty data for tickers: {tickers}")
            return PerformanceResult(data=[], total_return=0, total_return_pct=0)
        
        # yfinance returns different structures based on # of tickers
        # Single ticker: columns are ['Open', 'High', 'Low', 'Close', 'Volume'] or MultiIndex
        # Multiple tickers: columns are MultiIndex like [('Close', 'AAPL'), ('Close', 'MSFT')]
        
        if len(tickers) == 1:
            ticker = tickers[0]
            # Check if it's MultiIndex columns
            if isinstance(hist_data.columns, pd.MultiIndex):
                # MultiIndex: get ('Close', ticker)
                if ('Close', ticker) in hist_data.columns:
                    close_series = hist_data[('Close', ticker)]
                else:
                    logger.error(f"[PERF] Could not find Close for {ticker} in MultiIndex")
                    return PerformanceResult(data=[], total_return=0, total_return_pct=0)
            else:
                # Simple columns: just get 'Close'
                close_series = hist_data['Close']
            
            # Flatten if needed (squeeze 2D to 1D)
            if hasattr(close_series, 'squeeze'):
                close_series = close_series.squeeze()
            
            close_prices = pd.DataFrame({ticker: close_series})
        else:
            # Multiple tickers - columns should be MultiIndex
            if isinstance(hist_data.columns, pd.MultiIndex):
                close_prices = hist_data["Close"]
            else:
                # Fallback - shouldn't happen but handle it
                close_prices = hist_data[["Close"]].rename(columns={"Close": tickers[0]})
        
        # Forward-fill missing prices (weekends, holidays, newly listed stocks)
        close_prices = close_prices.ffill()
        # Also backfill for stocks that start trading later
        close_prices = close_prices.bfill()
        
    except Exception as e:
        logger.error(f"Error fetching historical prices: {e}")
        return PerformanceResult(data=[], total_return=0, total_return_pct=0)
    
    # 5. Get exchange rates for CZK conversion
    rates = await exchange_service.get_rates()
    
    # 6. Build the daily series from transactions and prices
    series = _build_stock_series(
        transactions=transactions,
        close_prices=close_prices,
        ticker_info=ticker_info,
        rates=rates,
        display_start_date=display_start_date,
    )

    # 7. Calculate returns
    if len(series) >= 2:
        total_return, total_return_pct = _period_return(series[0], series[-1])
    else:
        total_return = 0
        total_return_pct = 0

    result_data = [
        PerformancePoint(
            date=point.date,
            value=round(point.value_czk, 2),
            invested=round(point.cost_basis_czk, 2) + 0.0,  # + 0.0 turns -0.0 into 0.0
            benchmark=None,
        )
        for point in series
    ]

    result = PerformanceResult(
        data=result_data,
        total_return=round(total_return, 2),
        total_return_pct=round(total_return_pct, 2),
        benchmark_return_pct=None
    )
    
    # Cache stock performance
    await redis.set(cache_key, result.model_dump_json(), ex=CacheTTL.PERFORMANCE)
    
    return result


async def get_options_performance(
    user_id: str,
    portfolio_id: Optional[str] = None,
    period: str = "1Y"
) -> PerformanceResult:
    """
    Calculate options P/L performance over time.
    
    For options, we track cumulative realized P/L from closed positions
    plus premium received/paid.
    """
    redis = get_redis()
    
    # Cache key
    cache_key = f"perf:options:{user_id}:{portfolio_id or 'all'}:{period}"
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return PerformanceResult(**data)
    
    # 1. Get option transactions
    query = supabase.table("option_transactions") \
        .select("*") \
        .order("date", desc=False)
    
    if portfolio_id:
        portfolio = supabase.table("portfolios") \
            .select("id") \
            .eq("id", portfolio_id) \
            .eq("user_id", user_id) \
            .execute()
        if not portfolio.data:
            return PerformanceResult(data=[], total_return=0, total_return_pct=0)
        query = query.eq("portfolio_id", portfolio_id)
    else:
        portfolios = supabase.table("portfolios") \
            .select("id") \
            .eq("user_id", user_id) \
            .execute()
        portfolio_ids = [p["id"] for p in portfolios.data]
        if not portfolio_ids:
            return PerformanceResult(data=[], total_return=0, total_return_pct=0)
        query = query.in_("portfolio_id", portfolio_ids)
    
    transactions = query.execute().data
    if not transactions:
        return PerformanceResult(data=[], total_return=0, total_return_pct=0)
    
    # 2. Determine date range
    first_tx_date = pd.to_datetime(transactions[0]["date"]).date()
    today = datetime.now().date()
    
    start_date = max(_period_start_date(period, today, first_tx_date), first_tx_date)
    
    daily_pnl: Dict[str, float] = {}
    grouped_transactions: Dict[tuple[str, str], List[dict]] = {}
    for tx in transactions:
        key = (tx["portfolio_id"], tx["option_symbol"])
        grouped_transactions.setdefault(key, []).append(tx)

    total_realized_pl = 0.0
    for txs in grouped_transactions.values():
        accounting = calculate_option_accounting(txs)
        for event in accounting.realized_events:
            tx_date = pd.to_datetime(event.date).date()
            if tx_date < start_date:
                continue
            if event.date not in daily_pnl:
                daily_pnl[event.date] = 0.0
            daily_pnl[event.date] += event.realized_pl_czk
            total_realized_pl += event.realized_pl_czk
    
    # 4. Build cumulative performance
    result_data = []
    cumulative_pnl = 0.0
    
    # Generate all dates in range
    date_range = pd.date_range(start=start_date, end=today, freq='D')
    
    for day in date_range:
        date_str = day.date().isoformat()
        if date_str in daily_pnl:
            cumulative_pnl += daily_pnl[date_str]
        
        # Only add points where something happened or at key intervals
        if date_str in daily_pnl or day == date_range[0] or day == date_range[-1]:
            result_data.append(PerformancePoint(
                date=date_str,
                value=round(cumulative_pnl, 2),
                invested=0,  # Options don't have "invested" in same way
                benchmark=None
            ))
    
    result = PerformanceResult(
        data=result_data,
        total_return=round(cumulative_pnl, 2),
        total_return_pct=0,  # No base to calculate % for options
        benchmark_return_pct=None
    )
    
    # Cache options performance
    await redis.set(cache_key, result.model_dump_json(), ex=CacheTTL.PERFORMANCE)
    
    return result
