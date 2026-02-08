"""
Portfolio Performance Service

Calculates historical portfolio value over time by reconstructing
daily positions from transactions and fetching historical prices.
"""
import yfinance as yf
import pandas as pd
import numpy as np
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel

from app.core.supabase import supabase
from app.core.redis import get_redis
from app.services.exchange import ExchangeRateService

logger = logging.getLogger(__name__)

# Period definitions
PERIODS = {
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "MTD": None,  # Special handling - month to date
    "YTD": None,  # Special handling - year to date
    "1Y": 365,
    "ALL": None,  # Use first transaction date
}


class PerformancePoint(BaseModel):
    date: str
    value: float
    invested: float
    benchmark: Optional[float] = None


class PerformanceResult(BaseModel):
    data: List[PerformancePoint]
    total_return: float
    total_return_pct: float
    benchmark_return_pct: Optional[float] = None


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
    cache_key = f"perf:stock:{user_id}:{portfolio_id or 'all'}:{period}:{from_date or ''}:{to_date or ''}"
    
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
    elif period == "YTD":
        display_start_date = datetime(today.year, 1, 1).date()
    elif period == "MTD":
        display_start_date = datetime(today.year, today.month, 1).date()
    elif period == "ALL":
        display_start_date = first_tx_date
    else:
        days = PERIODS.get(period, 365)
        display_start_date = today - timedelta(days=days)
    
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
        hist_data = yf.download(
            tickers,
            start=fetch_start_date,
            end=end_date + timedelta(days=1),
            progress=False
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
    exchange_service = ExchangeRateService()
    rates = await exchange_service.get_rates()
    
    # 6. Build daily positions from transactions
    positions: Dict[str, float] = {}  # ticker -> shares
    invested_total_czk = 0.0
    tx_by_date: Dict[str, List[dict]] = {}
    
    for tx in transactions:
        tx_date = pd.to_datetime(tx["executed_at"]).date().isoformat()
        if tx_date not in tx_by_date:
            tx_by_date[tx_date] = []
        tx_by_date[tx_date].append(tx)
    
    # 7. Calculate daily portfolio value
    result_data = []
    dates = close_prices.index.tolist()
    
    for date in dates:
        date_str = date.date().isoformat()
        
        # Apply any transactions on this date
        if date_str in tx_by_date:
            for tx in tx_by_date[date_str]:
                ticker = tx["stocks"]["ticker"]
                shares = float(tx["shares"])
                
                # Use total_amount_czk if available, otherwise convert manually
                if tx.get("total_amount_czk"):
                    amount_czk = float(tx["total_amount_czk"])
                else:
                    total_amount = float(tx["total_amount"])
                    rate = float(tx.get("exchange_rate_to_czk") or rates.get(tx.get("currency", "USD"), 23.5))
                    amount_czk = total_amount * rate
                
                if tx["type"] == "BUY":
                    positions[ticker] = positions.get(ticker, 0) + shares
                    invested_total_czk += amount_czk
                else:  # SELL
                    positions[ticker] = positions.get(ticker, 0) - shares
                    invested_total_czk -= amount_czk
        
        # Calculate portfolio value in CZK
        portfolio_value_czk = 0.0
        for ticker, shares in positions.items():
            if shares > 0 and ticker in close_prices.columns:
                price = close_prices.loc[date, ticker]
                if pd.notna(price):
                    # Apply price scale for LSE stocks
                    info = ticker_info.get(ticker, {})
                    scale = info.get("price_scale", 1) or 1
                    currency = info.get("currency", "USD")
                    rate = rates.get(currency, 23.5)
                    
                    value_in_currency = shares * float(price) * scale
                    portfolio_value_czk += value_in_currency * rate
        
        # Only add to output if in display range
        current_date = date.date()
        if current_date >= display_start_date and (portfolio_value_czk > 0 or invested_total_czk > 0):
            result_data.append(PerformancePoint(
                date=date_str,
                value=round(portfolio_value_czk, 2),
                invested=round(max(invested_total_czk, 0), 2),
                benchmark=None
            ))
    
    # 8. Calculate returns
    if len(result_data) >= 2:
        start_value = result_data[0].value  # Portfolio VALUE at start of period
        end_value = result_data[-1].value
        start_invested = result_data[0].invested
        end_invested = result_data[-1].invested
        
        # Net new money added during the period
        net_investment = end_invested - start_invested
        
        # Total return = value change minus new money added
        # This shows actual investment performance
        total_return = end_value - start_value - net_investment
        
        # Percentage return based on starting portfolio value
        # This is closer to TWR (time-weighted return)
        total_return_pct = (total_return / start_value * 100) if start_value > 0 else 0
        
    else:
        total_return = 0
        total_return_pct = 0
    
    result = PerformanceResult(
        data=result_data,
        total_return=round(total_return, 2),
        total_return_pct=round(total_return_pct, 2),
        benchmark_return_pct=None
    )
    
    # Cache for 1 hour
    await redis.set(cache_key, result.model_dump_json(), ex=3600)
    
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
    
    if period == "YTD":
        start_date = datetime(today.year, 1, 1).date()
    elif period == "ALL":
        start_date = first_tx_date
    else:
        days = PERIODS.get(period, 365)
        start_date = today - timedelta(days=days)
    
    start_date = max(start_date, first_tx_date)
    
    # 3. Calculate cumulative P/L by date
    # Options P/L:
    # - STO (Sell to Open): +premium received
    # - BTC (Buy to Close): -premium paid (cost to close)
    # - BTO (Buy to Open): -premium paid
    # - STC (Sell to Close): +premium received
    # - EXPIRE: 0 (option expired worthless - profit if STO, loss if BTO)
    
    daily_pnl: Dict[str, float] = {}
    total_premium_received = 0.0
    
    for tx in transactions:
        tx_date = pd.to_datetime(tx["date"]).date()
        if tx_date < start_date:
            continue
        
        date_str = tx_date.isoformat()
        action = tx["action"]
        # Use total_premium if available, otherwise calculate
        if tx.get("total_premium"):
            premium = abs(float(tx["total_premium"]))
        else:
            contracts = int(tx.get("contracts", 1))
            price_per = float(tx.get("premium", 0) or 0)
            premium = price_per * contracts * 100
        
        pnl = 0.0
        if action in ["STO", "STC"]:
            pnl = premium  # Received premium
            total_premium_received += premium
        elif action in ["BTO", "BTC"]:
            pnl = -premium  # Paid premium
        # EXPIRE, ASSIGNMENT, EXERCISE - handle separately if needed
        
        if date_str not in daily_pnl:
            daily_pnl[date_str] = 0
        daily_pnl[date_str] += pnl
    
    # 4. Build cumulative performance
    result_data = []
    cumulative_pnl = 0.0
    
    # Generate all dates in range
    date_range = pd.date_range(start=start_date, end=today, freq='D')
    
    for date in date_range:
        date_str = date.date().isoformat()
        if date_str in daily_pnl:
            cumulative_pnl += daily_pnl[date_str]
        
        # Only add points where something happened or at key intervals
        if date_str in daily_pnl or date == date_range[0] or date == date_range[-1]:
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
    
    # Cache for 1 hour
    await redis.set(cache_key, result.model_dump_json(), ex=3600)
    
    return result


# Service instance
performance_service = {
    "get_stock_performance": get_stock_performance,
    "get_options_performance": get_options_performance,
}
