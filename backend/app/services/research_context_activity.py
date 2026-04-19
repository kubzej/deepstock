"""
Activity and portfolio-focused helpers for the MCP research context surface.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

from app.core.supabase import supabase
from app.services.exchange import exchange_service
from app.services.market import market_service
from app.services.options import options_service
from app.services.performance import get_options_performance, get_stock_performance
from app.services.portfolio import portfolio_service
from app.services.stocks import stock_service

VALID_PORTFOLIO_PERFORMANCE_PERIODS: set[str] = {"1W", "1M", "3M", "6M", "MTD", "YTD", "1Y", "ALL"}
VALID_ACTIVITY_PERIODS: set[str] = VALID_PORTFOLIO_PERFORMANCE_PERIODS


class ActivityFilterError(ValueError):
    pass


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _serialize_stock_activity_transaction(transaction: dict) -> dict:
    return {
        "id": transaction.get("id"),
        "asset_type": "stock",
        "portfolio_id": transaction.get("portfolio_id"),
        "portfolio_name": transaction.get("portfolio_name", ""),
        "executed_at": transaction.get("executed_at"),
        "ticker": (transaction.get("stocks") or {}).get("ticker") or transaction.get("ticker"),
        "type": transaction.get("type"),
        "action": None,
        "shares": _coerce_float(transaction.get("shares")),
        "price_per_share": _coerce_float(transaction.get("price_per_share")),
        "option_symbol": None,
        "option_type": None,
        "strike": None,
        "expiration": None,
        "contracts": None,
        "premium": None,
        "currency": transaction.get("currency"),
        "fees": _coerce_float(transaction.get("fees")) or 0.0,
        "notes": transaction.get("notes"),
        "source_transaction_id": transaction.get("source_transaction_id"),
        "remaining_shares": _coerce_float(transaction.get("remaining_shares")),
        "realized_pnl": _coerce_float(transaction.get("realized_pnl")),
        "realized_pnl_czk": _coerce_float(transaction.get("realized_pnl_czk")),
        "position_after": None,
    }


def _serialize_option_activity_transaction(transaction: dict) -> dict:
    return {
        "id": transaction.get("id"),
        "asset_type": "option",
        "portfolio_id": transaction.get("portfolio_id"),
        "portfolio_name": transaction.get("portfolio_name", ""),
        "executed_at": transaction.get("date"),
        "ticker": transaction.get("symbol"),
        "type": None,
        "action": transaction.get("action"),
        "shares": None,
        "price_per_share": None,
        "option_symbol": transaction.get("option_symbol"),
        "option_type": transaction.get("option_type"),
        "strike": _coerce_float(transaction.get("strike_price")),
        "expiration": transaction.get("expiration_date"),
        "contracts": transaction.get("contracts"),
        "premium": _coerce_float(transaction.get("premium")),
        "currency": transaction.get("currency"),
        "fees": _coerce_float(transaction.get("fees")) or 0.0,
        "notes": transaction.get("notes"),
        "source_transaction_id": None,
        "remaining_shares": None,
        "realized_pnl": None,
        "realized_pnl_czk": None,
        "position_after": transaction.get("position"),
    }


def _sort_activity_transactions_desc(transactions: list[dict]) -> list[dict]:
    return sorted(transactions, key=lambda item: item.get("executed_at") or "", reverse=True)


def _parse_activity_date(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ActivityFilterError(
            f"Invalid {field_name} '{value}'. Expected YYYY-MM-DD format."
        ) from exc


def _parse_activity_cursor(value: str) -> datetime:
    normalized = value.strip()
    if not normalized:
        raise ActivityFilterError("Cursor cannot be empty.")
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ActivityFilterError(
            f"Invalid cursor '{value}'. Expected ISO datetime format."
        ) from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _activity_period_start(period: str, today: date) -> Optional[date]:
    if period == "ALL":
        return None
    if period == "1W":
        return today - timedelta(days=7)
    if period == "1M":
        return today - timedelta(days=30)
    if period == "3M":
        return today - timedelta(days=90)
    if period == "6M":
        return today - timedelta(days=180)
    if period == "MTD":
        return today.replace(day=1)
    if period == "YTD":
        return today.replace(month=1, day=1)
    if period == "1Y":
        return today - timedelta(days=365)
    raise ActivityFilterError(
        f"Unsupported activity period '{period}'. Expected one of: {', '.join(sorted(VALID_ACTIVITY_PERIODS))}"
    )


def _resolve_activity_window(
    period: str = "ALL",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    cursor: Optional[str] = None,
) -> dict[str, Optional[str]]:
    normalized_period = period.upper()
    if normalized_period not in VALID_ACTIVITY_PERIODS:
        raise ActivityFilterError(
            f"Unsupported activity period '{period}'. Expected one of: {', '.join(sorted(VALID_ACTIVITY_PERIODS))}"
        )

    today = datetime.now(timezone.utc).date()
    has_custom_range = bool(from_date or to_date)
    start_date = _parse_activity_date(from_date, "from_date") if from_date else None
    end_date = _parse_activity_date(to_date, "to_date") if to_date else today

    if has_custom_range:
        if start_date and start_date > end_date:
            raise ActivityFilterError("from_date cannot be after to_date.")
        resolved_period = "custom"
    else:
        start_date = _activity_period_start(normalized_period, today)
        resolved_period = normalized_period

    lower_bound = (
        datetime.combine(start_date, time.min, tzinfo=timezone.utc).isoformat()
        if start_date
        else None
    )
    upper_bound_dt = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)

    cursor_value = None
    if cursor:
        cursor_dt = _parse_activity_cursor(cursor)
        cursor_value = cursor_dt.isoformat()
        if cursor_dt < upper_bound_dt:
            upper_bound_dt = cursor_dt

    return {
        "period": resolved_period,
        "from_date": start_date.isoformat() if start_date else None,
        "to_date": end_date.isoformat(),
        "cursor": cursor_value,
        "lower_bound": lower_bound,
        "upper_bound": upper_bound_dt.isoformat(),
    }


def _serialize_option_holding(holding: dict) -> dict:
    return {
        "portfolio_id": holding.get("portfolio_id"),
        "option_symbol": holding.get("option_symbol"),
        "option_type": holding.get("option_type"),
        "strike": _coerce_float(holding.get("strike_price")),
        "expiration": holding.get("expiration_date"),
        "position": holding.get("position"),
        "contracts": holding.get("contracts"),
        "avg_premium": _coerce_float(holding.get("avg_premium")),
        "total_cost": _coerce_float(holding.get("total_cost")),
        "currency": holding.get("currency"),
    }


def _serialize_portfolio_summary(portfolio: dict, snapshot: Optional[dict] = None) -> dict:
    return {
        "id": portfolio["id"],
        "name": portfolio["name"],
        "description": portfolio.get("description"),
        "snapshot": snapshot,
    }


def _serialize_portfolio_holding(holding: dict, quote: Optional[dict], fx_rate: float) -> dict:
    stock = holding.get("stocks") or {}
    shares = float(holding.get("shares") or 0)
    price_scale = float(stock.get("price_scale") or 1)
    current_price = _coerce_float((quote or {}).get("price"))
    current_value_czk = current_price * price_scale * shares * fx_rate if current_price is not None else None
    invested_czk = float(holding.get("total_invested_czk") or 0)
    unrealized_pnl_czk = current_value_czk - invested_czk if current_value_czk is not None else None
    unrealized_pnl_pct = (
        (unrealized_pnl_czk / invested_czk * 100) if unrealized_pnl_czk is not None and invested_czk > 0 else None
    )
    return {
        "portfolio_id": holding.get("portfolio_id"),
        "portfolio_name": holding.get("portfolio_name"),
        "ticker": stock.get("ticker") or "",
        "name": stock.get("name") or "",
        "shares": shares,
        "avg_cost": float(holding.get("avg_cost_per_share") or 0),
        "currency": stock.get("currency") or "USD",
        "sector": stock.get("sector"),
        "total_invested_czk": invested_czk,
        "current_price": current_price,
        "current_value_czk": round(current_value_czk, 2) if current_value_czk is not None else None,
        "unrealized_pnl_czk": round(unrealized_pnl_czk, 2) if unrealized_pnl_czk is not None else None,
        "unrealized_pnl_pct": round(unrealized_pnl_pct, 4) if unrealized_pnl_pct is not None else None,
    }


def _build_sector_exposure(holdings: list[dict]) -> list[dict]:
    totals: dict[str, float] = {}
    for holding in holdings:
        sector = holding.get("sector") or "Unknown"
        value_czk = float(holding.get("current_value_czk") or 0)
        if value_czk <= 0:
            continue
        totals[sector] = totals.get(sector, 0.0) + value_czk

    grand_total = sum(totals.values())
    if grand_total <= 0:
        return []

    exposure = [
        {
            "sector": sector,
            "value_czk": round(value_czk, 2),
            "weight_pct": round(value_czk / grand_total * 100, 2),
        }
        for sector, value_czk in totals.items()
    ]
    exposure.sort(key=lambda item: item["value_czk"], reverse=True)
    return exposure


def _performance_to_payload(result: Any) -> dict:
    return {
        "total_return": result.total_return,
        "total_return_pct": result.total_return_pct,
        "benchmark_return_pct": result.benchmark_return_pct,
        "data": [point.model_dump() for point in result.data],
    }


class ActivityPortfolioContextService:
    async def resolve_portfolio_scope(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
    ) -> tuple[str, list[dict], Optional[dict]]:
        portfolios = await portfolio_service.get_user_portfolios(user_id)
        if portfolio_id:
            portfolio = next((item for item in portfolios if item["id"] == portfolio_id), None)
            if not portfolio:
                raise ValueError(f"Portfolio {portfolio_id} not found")
            return portfolio_id, [portfolio], portfolio
        return "all", portfolios, None

    async def build_activity_context(self, ticker: str, user_id: str, stock_price: Optional[float]) -> dict:
        stock = await stock_service.get_by_ticker(ticker)
        portfolios = await portfolio_service.get_user_portfolios(user_id)
        portfolio_ids = [portfolio["id"] for portfolio in portfolios]
        portfolio_names = {portfolio["id"]: portfolio["name"] for portfolio in portfolios}

        stock_transactions: list[dict] = []
        position_summary = {
            "has_position": False,
            "shares": 0.0,
            "total_cost": 0.0,
            "market_value": None,
            "unrealized_pnl": None,
            "currency": None,
        }

        if stock and portfolio_ids:
            response = supabase.table("transactions") \
                .select("*, source_transaction:source_transaction_id(id, executed_at, price_per_share, currency, shares)") \
                .in_("portfolio_id", portfolio_ids) \
                .eq("stock_id", stock["id"]) \
                .order("executed_at", desc=True) \
                .limit(100) \
                .execute()
            annotated = await portfolio_service._annotate_transactions(response.data or [])
            for tx in annotated:
                tx["portfolio_name"] = portfolio_names.get(tx["portfolio_id"], "")
            stock_transactions = [_serialize_stock_activity_transaction(tx) for tx in annotated]

            holdings = await portfolio_service.get_all_holdings(user_id)
            matching_holdings = [
                holding for holding in holdings
                if (holding.get("stocks") or {}).get("ticker") == ticker and float(holding.get("shares") or 0) > 0
            ]
            if matching_holdings:
                total_shares = sum(float(holding.get("shares") or 0) for holding in matching_holdings)
                total_cost = sum(float(holding.get("total_cost") or 0) for holding in matching_holdings)
                market_value = total_shares * stock_price if stock_price is not None else None
                unrealized_pnl = market_value - total_cost if market_value is not None else None
                currency = (matching_holdings[0].get("stocks") or {}).get("currency")
                position_summary = {
                    "has_position": total_shares > 0,
                    "shares": round(total_shares, 4),
                    "total_cost": round(total_cost, 4),
                    "market_value": round(market_value, 4) if market_value is not None else None,
                    "unrealized_pnl": round(unrealized_pnl, 4) if unrealized_pnl is not None else None,
                    "currency": currency,
                }

        option_transactions = await options_service.get_transactions(user_id=user_id, symbol=ticker, limit=100)
        option_holdings = await options_service.get_all_holdings_for_user(user_id)
        matching_option_holdings = [holding for holding in option_holdings if holding.get("symbol") == ticker]
        option_summary = {
            "has_option_activity": bool(option_transactions or matching_option_holdings),
            "open_positions": len(matching_option_holdings),
            "contracts": sum(int(holding.get("contracts") or 0) for holding in matching_option_holdings),
            "open_holdings": [_serialize_option_holding(holding) for holding in matching_option_holdings],
        }

        return {
            "position_summary": position_summary,
            "stock_transaction_count": len(stock_transactions),
            "latest_stock_transaction_at": stock_transactions[0].get("executed_at") if stock_transactions else None,
            "has_more_stock_transactions": len(stock_transactions) >= 100,
            "option_summary": option_summary,
            "option_transaction_count": len(option_transactions),
            "latest_option_transaction_at": option_transactions[0].get("date") if option_transactions else None,
            "has_more_option_transactions": len(option_transactions) >= 100,
        }

    async def get_recent_portfolio_activity(
        self,
        user_id: str,
        scoped_portfolio: Optional[dict],
        recent_limit: int,
    ) -> list[dict]:
        if scoped_portfolio:
            stock_transactions_raw = await portfolio_service.get_transactions(scoped_portfolio["id"], limit=recent_limit)
            for tx in stock_transactions_raw:
                tx["portfolio_name"] = scoped_portfolio["name"]
            option_transactions_raw = await options_service.get_transactions(
                user_id=user_id,
                portfolio_id=scoped_portfolio["id"],
                limit=recent_limit,
            )
        else:
            stock_page = await portfolio_service.get_all_transactions(user_id, limit=recent_limit)
            stock_transactions_raw = stock_page["data"]
            option_transactions_raw = await options_service.get_transactions(user_id=user_id, limit=recent_limit)

        mixed_transactions = [_serialize_stock_activity_transaction(tx) for tx in stock_transactions_raw] + [
            _serialize_option_activity_transaction(tx) for tx in option_transactions_raw
        ]
        return _sort_activity_transactions_desc(mixed_transactions)[:recent_limit]

    async def fetch_stock_activity_rows(
        self,
        portfolio_ids: list[str],
        portfolio_names: dict[str, str],
        stock_id: Optional[str],
        limit: int,
        lower_bound: Optional[str],
        upper_bound: Optional[str],
    ) -> list[dict]:
        if not portfolio_ids or stock_id is None:
            return []

        query = supabase.table("transactions") \
            .select("*, stocks(ticker, name), source_transaction:source_transaction_id(id, executed_at, price_per_share, currency, shares)") \
            .in_("portfolio_id", portfolio_ids) \
            .order("executed_at", desc=True) \
            .limit(limit + 1)

        if stock_id:
            query = query.eq("stock_id", stock_id)
        if lower_bound:
            query = query.gte("executed_at", lower_bound)
        if upper_bound:
            query = query.lt("executed_at", upper_bound)

        response = query.execute()
        annotated = await portfolio_service._annotate_transactions(response.data or [])
        for tx in annotated:
            tx["portfolio_name"] = portfolio_names.get(tx["portfolio_id"], "")
        return annotated

    async def fetch_option_activity_rows(
        self,
        portfolio_ids: list[str],
        symbol: Optional[str],
        limit: int,
        lower_bound: Optional[str],
        upper_bound: Optional[str],
    ) -> list[dict]:
        if not portfolio_ids:
            return []

        query = supabase.table("option_transactions") \
            .select("*, portfolios(name)") \
            .in_("portfolio_id", portfolio_ids) \
            .order("date", desc=True) \
            .limit(limit + 1)

        if symbol:
            query = query.eq("symbol", symbol)
        if lower_bound:
            query = query.gte("date", lower_bound)
        if upper_bound:
            query = query.lt("date", upper_bound)

        response = query.execute()
        rows = []
        for tx in response.data or []:
            tx["portfolio_name"] = tx.get("portfolios", {}).get("name", "") if tx.get("portfolios") else ""
            del tx["portfolios"]
            rows.append(tx)
        return await options_service._annotate_transactions(rows)

    async def get_mixed_activity_feed(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        ticker: Optional[str] = None,
        period: str = "ALL",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> dict:
        scope, portfolios, scoped_portfolio = await self.resolve_portfolio_scope(user_id, portfolio_id)
        portfolio_ids = [portfolio["id"] for portfolio in portfolios]
        portfolio_names = {portfolio["id"]: portfolio["name"] for portfolio in portfolios}
        normalized_ticker = ticker.upper() if ticker else None
        window = _resolve_activity_window(period=period, from_date=from_date, to_date=to_date, cursor=cursor)

        stock = await stock_service.get_by_ticker(normalized_ticker) if normalized_ticker else None
        stock_id = stock["id"] if stock else None
        stock_rows, option_rows = await asyncio.gather(
            self.fetch_stock_activity_rows(
                portfolio_ids=portfolio_ids,
                portfolio_names=portfolio_names,
                stock_id=stock_id,
                limit=limit,
                lower_bound=window["lower_bound"],
                upper_bound=window["upper_bound"],
            ),
            self.fetch_option_activity_rows(
                portfolio_ids=portfolio_ids,
                symbol=normalized_ticker,
                limit=limit,
                lower_bound=window["lower_bound"],
                upper_bound=window["upper_bound"],
            ),
        )

        mixed_transactions = _sort_activity_transactions_desc(
            [_serialize_stock_activity_transaction(tx) for tx in stock_rows]
            + [_serialize_option_activity_transaction(tx) for tx in option_rows]
        )
        has_more = len(mixed_transactions) > limit
        transactions = mixed_transactions[:limit]
        next_cursor = transactions[-1].get("executed_at") if has_more and transactions else None

        return {
            "scope": scope,
            "portfolio_id": scoped_portfolio["id"] if scoped_portfolio else None,
            "portfolio_name": scoped_portfolio["name"] if scoped_portfolio else None,
            "portfolio_count": len(portfolios),
            "period": window["period"],
            "from_date": window["from_date"],
            "to_date": window["to_date"],
            "limit": limit,
            "cursor": window["cursor"],
            "next_cursor": next_cursor,
            "has_more": has_more,
            "transactions": transactions,
        }

    async def get_ticker_activity(
        self,
        ticker: str,
        user_id: str,
        period: str = "ALL",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> dict:
        normalized_ticker = ticker.upper()
        stock = await stock_service.get_by_ticker(normalized_ticker)
        if not stock:
            raise ValueError(f"Ticker {normalized_ticker} not found")
        activity_context = await self.build_activity_context(normalized_ticker, user_id=user_id, stock_price=None)
        feed = await self.get_mixed_activity_feed(
            user_id=user_id,
            ticker=normalized_ticker,
            period=period,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            cursor=cursor,
        )

        return {
            "ticker": normalized_ticker,
            "generated_at": _iso_now(),
            "period": feed["period"],
            "from_date": feed["from_date"],
            "to_date": feed["to_date"],
            "limit": feed["limit"],
            "cursor": feed["cursor"],
            "next_cursor": feed["next_cursor"],
            "has_more": feed["has_more"],
            "position_summary": activity_context["position_summary"],
            "transactions": feed["transactions"],
            "option_summary": activity_context["option_summary"],
        }

    async def get_portfolio_activity(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        period: str = "ALL",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> dict:
        feed = await self.get_mixed_activity_feed(
            user_id=user_id,
            portfolio_id=portfolio_id,
            period=period,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            cursor=cursor,
        )
        return {
            "scope": feed["scope"],
            "generated_at": _iso_now(),
            "portfolio_id": feed["portfolio_id"],
            "portfolio_name": feed["portfolio_name"],
            "portfolio_count": feed["portfolio_count"],
            "period": feed["period"],
            "from_date": feed["from_date"],
            "to_date": feed["to_date"],
            "limit": feed["limit"],
            "cursor": feed["cursor"],
            "next_cursor": feed["next_cursor"],
            "has_more": feed["has_more"],
            "transactions": feed["transactions"],
        }

    async def list_portfolios(self, user_id: str) -> dict:
        portfolios = await portfolio_service.get_user_portfolios(user_id)
        portfolio_summaries = []
        for portfolio in portfolios:
            snapshot = await portfolio_service.get_portfolio_snapshot(portfolio["id"], user_id)
            portfolio_summaries.append(_serialize_portfolio_summary(portfolio, snapshot.model_dump()))
        return {
            "generated_at": _iso_now(),
            "portfolio_count": len(portfolio_summaries),
            "portfolios": portfolio_summaries,
        }

    async def get_portfolio_context(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        recent_limit: int = 20,
    ) -> dict:
        scope, portfolios, scoped_portfolio = await self.resolve_portfolio_scope(user_id, portfolio_id)

        if scoped_portfolio:
            holdings_raw = await portfolio_service.get_holdings(scoped_portfolio["id"])
            for holding in holdings_raw:
                holding["portfolio_name"] = scoped_portfolio["name"]
            open_lots = await portfolio_service.get_all_open_lots(scoped_portfolio["id"])
            aggregate_snapshot = await portfolio_service.get_portfolio_snapshot(scoped_portfolio["id"], user_id)
        else:
            holdings_raw = await portfolio_service.get_all_holdings(user_id)
            open_lots = await portfolio_service.get_all_open_lots_for_user(user_id)
            aggregate_snapshot = await portfolio_service.get_portfolio_snapshot(None, user_id)

        recent_transactions = await self.get_recent_portfolio_activity(
            user_id=user_id,
            scoped_portfolio=scoped_portfolio,
            recent_limit=recent_limit,
        )

        tickers = sorted({
            (holding.get("stocks") or {}).get("ticker")
            for holding in holdings_raw
            if (holding.get("stocks") or {}).get("ticker")
        })
        quotes = await market_service.get_quotes(tickers) if tickers else {}
        exchange_rates = await exchange_service.get_rates()

        holdings = []
        for holding in holdings_raw:
            stock = holding.get("stocks") or {}
            ticker = stock.get("ticker")
            currency = stock.get("currency") or "USD"
            rate = float(exchange_rates.get(currency, 1.0))
            holdings.append(_serialize_portfolio_holding(holding, quotes.get(ticker), rate))

        holdings.sort(key=lambda item: float(item.get("current_value_czk") or 0), reverse=True)

        portfolio_summaries = []
        for portfolio in portfolios:
            snapshot = await portfolio_service.get_portfolio_snapshot(portfolio["id"], user_id)
            portfolio_summaries.append(_serialize_portfolio_summary(portfolio, snapshot.model_dump()))

        open_lot_tickers = sorted({lot.get("ticker") for lot in open_lots if lot.get("ticker")})
        return {
            "scope": scope,
            "generated_at": _iso_now(),
            "portfolio_count": len(portfolio_summaries),
            "portfolios": portfolio_summaries,
            "aggregate_snapshot": aggregate_snapshot.model_dump(),
            "holdings": holdings,
            "sector_exposure": _build_sector_exposure(holdings),
            "recent_transactions": recent_transactions,
            "open_lots_summary": {
                "count": len(open_lots),
                "tickers": open_lot_tickers,
            },
        }

    async def get_portfolio_performance(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        period: str = "1Y",
    ) -> dict:
        if period not in VALID_PORTFOLIO_PERFORMANCE_PERIODS:
            raise ValueError(
                f"Unsupported portfolio performance period '{period}'. Expected one of: "
                + ", ".join(sorted(VALID_PORTFOLIO_PERFORMANCE_PERIODS))
            )
        scope, _, _ = await self.resolve_portfolio_scope(user_id, portfolio_id)
        stock_result, options_result = await asyncio.gather(
            get_stock_performance(user_id, portfolio_id=portfolio_id, period=period),
            get_options_performance(user_id, portfolio_id=portfolio_id, period=period),
        )
        return {
            "scope": scope,
            "generated_at": _iso_now(),
            "period": period,
            "stock_performance": _performance_to_payload(stock_result),
            "options_performance": _performance_to_payload(options_result),
        }


activity_portfolio_context_service = ActivityPortfolioContextService()
