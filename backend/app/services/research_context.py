"""
Research context service for chat-oriented stock discussions.

Builds a ticker-specific dossier from existing DeepStock domains:
- journal
- transactions and holdings
- options
- watchlists
- market data
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Iterable, Literal, Optional

from app.core.supabase import supabase
from app.services.journal import journal_service
from app.services.market import market_service
from app.services.options import options_service
from app.services.portfolio import portfolio_service
from app.services.stocks import stock_service

TechnicalPeriod = Literal["1w", "1mo", "3mo", "6mo", "1y", "2y"]
VALID_TECHNICAL_PERIODS: set[str] = {"1w", "1mo", "3mo", "6mo", "1y", "2y"}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _serialize_journal_entry(entry: dict) -> dict:
    return {
        "id": entry.get("id"),
        "created_at": entry.get("created_at"),
        "updated_at": entry.get("updated_at"),
        "type": entry.get("type"),
        "content": entry.get("content"),
        "metadata": entry.get("metadata") or {},
    }


def _serialize_ai_report(entry: dict, include_full_content: bool) -> dict:
    metadata = entry.get("metadata") or {}
    base = {
        "id": entry.get("id"),
        "created_at": entry.get("created_at"),
        "report_type": metadata.get("report_type"),
        "model": metadata.get("model"),
    }
    if include_full_content:
        return {**base, "content": entry.get("content") or ""}

    content = entry.get("content") or ""
    preview = content[:400].strip()
    if len(content) > 400:
        preview += "..."
    return {**base, "preview": preview}


def _serialize_stock_transaction(transaction: dict) -> dict:
    return {
        "id": transaction.get("id"),
        "portfolio_id": transaction.get("portfolio_id"),
        "portfolio_name": transaction.get("portfolio_name", ""),
        "executed_at": transaction.get("executed_at"),
        "type": transaction.get("type"),
        "shares": _coerce_float(transaction.get("shares")),
        "price_per_share": _coerce_float(transaction.get("price_per_share")),
        "currency": transaction.get("currency"),
        "fees": _coerce_float(transaction.get("fees")) or 0.0,
        "notes": transaction.get("notes"),
        "source_transaction_id": transaction.get("source_transaction_id"),
        "remaining_shares": _coerce_float(transaction.get("remaining_shares")),
        "realized_pnl": _coerce_float(transaction.get("realized_pnl")),
        "realized_pnl_czk": _coerce_float(transaction.get("realized_pnl_czk")),
    }


def _serialize_option_transaction(transaction: dict) -> dict:
    return {
        "id": transaction.get("id"),
        "portfolio_id": transaction.get("portfolio_id"),
        "portfolio_name": transaction.get("portfolio_name", ""),
        "executed_at": transaction.get("date"),
        "action": transaction.get("action"),
        "symbol": transaction.get("symbol"),
        "option_symbol": transaction.get("option_symbol"),
        "option_type": transaction.get("option_type"),
        "strike": _coerce_float(transaction.get("strike_price")),
        "expiration": transaction.get("expiration_date"),
        "contracts": transaction.get("contracts"),
        "premium": _coerce_float(transaction.get("premium")),
        "currency": transaction.get("currency"),
        "fees": _coerce_float(transaction.get("fees")) or 0.0,
        "notes": transaction.get("notes"),
        "position_after": transaction.get("position"),
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


def _serialize_watchlist_item(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "watchlist_id": item.get("watchlist_id"),
        "watchlist_name": item.get("watchlist_name", ""),
        "target_buy_price": _coerce_float(item.get("target_buy_price")),
        "target_sell_price": _coerce_float(item.get("target_sell_price")),
        "notes": item.get("notes"),
        "sector": item.get("sector"),
        "added_at": item.get("added_at"),
    }


def _valuation_label(signal: Optional[str]) -> dict[str, Optional[str]]:
    mapping = {
        "undervalued": {"text": "Podhodnocená", "color_class": "text-positive"},
        "slightly_undervalued": {
            "text": "Mírně podhodnocená",
            "color_class": "text-positive",
        },
        "fair": {"text": "Férová cena", "color_class": "text-muted-foreground"},
        "slightly_overvalued": {
            "text": "Mírně nadhodnocená",
            "color_class": "text-warning",
        },
        "overvalued": {"text": "Nadhodnocená", "color_class": "text-negative"},
        "hold": {"text": "Neutrální", "color_class": "text-muted-foreground"},
    }
    return mapping.get(signal or "", {"text": "Bez dat", "color_class": "text-muted-foreground"})


def _has_high_growth_potential(stock_info: dict) -> bool:
    signals = 0

    composite = (stock_info.get("valuation") or {}).get("composite") or {}
    composite_upside = composite.get("upside")
    if composite_upside is not None and composite_upside > 30:
        signals += 1

    target_mean = _coerce_float(stock_info.get("targetMeanPrice"))
    price = _coerce_float(stock_info.get("price"))
    analyst_count = stock_info.get("numberOfAnalystOpinions") or 0
    if target_mean and price and price > 0:
        analyst_upside = ((target_mean - price) / price) * 100
        if analyst_upside > 25 and analyst_count >= 5:
            signals += 1

    revenue_growth = stock_info.get("revenueGrowth")
    earnings_growth = stock_info.get("earningsGrowth")
    if (
        (revenue_growth is not None and revenue_growth > 0.2)
        or (earnings_growth is not None and earnings_growth > 0.2)
    ):
        signals += 1

    return signals >= 2


def _compute_verdict(insights: list[dict], valuation_signal: Optional[str], stock_info: dict) -> str:
    warnings = len([item for item in insights if item.get("type") == "warning"])
    positives = len([item for item in insights if item.get("type") == "positive"])

    is_undervalued = valuation_signal in {"undervalued", "slightly_undervalued"}
    is_overvalued = valuation_signal in {"overvalued", "slightly_overvalued"}
    high_growth = _has_high_growth_potential(stock_info)

    if warnings >= 3 and is_overvalued:
        return "skip"
    if warnings > positives + 2:
        return "skip"
    if positives >= 3 and (is_undervalued or valuation_signal == "fair"):
        return "explore"
    if positives > warnings and is_undervalued:
        return "explore"
    if high_growth and positives >= warnings and not is_overvalued:
        return "explore"
    if is_overvalued and warnings <= positives:
        return "watch"
    if valuation_signal in {"fair", None}:
        return "watch"
    return "mixed"


def _get_technical_note(stock_info: dict) -> Optional[str]:
    price = _coerce_float(stock_info.get("price"))
    high = _coerce_float(stock_info.get("fiftyTwoWeekHigh"))
    low = _coerce_float(stock_info.get("fiftyTwoWeekLow"))

    if not price or not high or not low:
        return None

    range_size = high - low
    if range_size <= 0:
        return None

    position = ((price - low) / range_size) * 100
    pct_from_high = ((high - price) / high) * 100
    pct_from_low = ((price - low) / low) * 100

    if position <= 20:
        return (
            f"Cena je {pct_from_low:.0f} % nad 52týdenním minimem "
            "a drží se blízko dna pásma."
        )
    if position >= 80:
        return (
            f"Cena je {pct_from_high:.0f} % pod 52týdenním maximem "
            "a drží se blízko vrcholu pásma."
        )
    return f"Cena je ve středu 52týdenního pásma ({position:.0f} % od dna)."


def _slice_history(items: list[dict], max_points: int = 30) -> list[dict]:
    if len(items) <= max_points:
        return items

    step = max(1, len(items) // max_points)
    sliced = items[::step]
    if sliced and sliced[-1] != items[-1]:
        sliced.append(items[-1])
    return sliced[:max_points]


def _pick_technical_history(technical_data: dict, indicators: Optional[set[str]] = None) -> dict:
    mapping = {
        "price": "priceHistory",
        "macd": "macdHistory",
        "bollinger": "bollingerHistory",
        "stochastic": "stochasticHistory",
        "rsi": "rsiHistory",
        "volume": "volumeHistory",
        "atr": "atrHistory",
        "obv": "obvHistory",
        "adx": "adxHistory",
        "fibonacci": "fibonacciHistory",
    }

    selected = indicators or {"price", "rsi", "macd", "bollinger", "volume"}
    history: dict[str, Any] = {"period": technical_data.get("period", "3mo")}
    for external_name, field_name in mapping.items():
        if external_name not in selected:
            continue
        history[external_name] = _slice_history(technical_data.get(field_name) or [])
    return history


class ResearchContextService:
    async def _get_stock_row(self, ticker: str) -> Optional[dict]:
        return await stock_service.get_by_ticker(ticker)

    async def _build_journal_context(
        self,
        ticker: str,
        user_id: str,
        notes_limit: int = 30,
        full_report_limit: int = 2,
        archive_report_limit: int = 10,
    ) -> dict:
        channel = await journal_service.get_channel_by_ticker(ticker, user_id=user_id)
        if not channel:
            return {
                "notes": [],
                "ai_reports": {"full": [], "archive": []},
                "external_refs": [],
            }

        entries = await journal_service.get_entries(
            channel_id=channel["id"],
            limit=100,
            user_id=user_id,
        )

        notes = [_serialize_journal_entry(entry) for entry in entries if entry.get("type") == "note"][:notes_limit]
        ai_report_entries = [entry for entry in entries if entry.get("type") == "ai_report"]
        full_reports = [
            _serialize_ai_report(entry, include_full_content=True)
            for entry in ai_report_entries[:full_report_limit]
        ]
        archive_reports = [
            _serialize_ai_report(entry, include_full_content=False)
            for entry in ai_report_entries[full_report_limit:full_report_limit + archive_report_limit]
        ]
        external_refs = [
            _serialize_journal_entry(entry)
            for entry in entries
            if entry.get("type") == "ext_ref"
        ][:10]

        return {
            "notes": notes,
            "ai_reports": {
                "full": full_reports,
                "archive": archive_reports,
            },
            "external_refs": external_refs,
        }

    async def _build_activity_context(self, ticker: str, user_id: str, stock_price: Optional[float]) -> dict:
        stock = await self._get_stock_row(ticker)
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
            stock_transactions = [_serialize_stock_transaction(tx) for tx in annotated]

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

        option_transactions = await options_service.get_transactions(
            user_id=user_id,
            symbol=ticker,
            limit=100,
        )
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
            "stock_transactions": stock_transactions,
            "option_summary": option_summary,
            "option_transactions": [_serialize_option_transaction(tx) for tx in option_transactions],
        }

    async def _build_watchlist_context(self, ticker: str, user_id: str) -> dict:
        stock = await self._get_stock_row(ticker)
        if not stock:
            return {"items": []}

        watchlist_rows = supabase.table("watchlists") \
            .select("id, name") \
            .eq("user_id", user_id) \
            .execute()
        watchlist_names = {row["id"]: row["name"] for row in (watchlist_rows.data or [])}
        if not watchlist_names:
            return {"items": []}

        item_rows = supabase.table("watchlist_items") \
            .select("*") \
            .in_("watchlist_id", list(watchlist_names.keys())) \
            .eq("stock_id", stock["id"]) \
            .order("added_at", desc=True) \
            .execute()

        items = []
        for item in item_rows.data or []:
            item["watchlist_name"] = watchlist_names.get(item.get("watchlist_id"), "")
            items.append(_serialize_watchlist_item(item))
        return {"items": items}

    def _build_ticker_info(self, stock_info: dict) -> dict:
        return {
            "symbol": stock_info.get("symbol"),
            "name": stock_info.get("name"),
            "sector": stock_info.get("sector"),
            "industry": stock_info.get("industry"),
            "country": stock_info.get("country"),
            "exchange": stock_info.get("exchange"),
            "currency": stock_info.get("currency"),
            "description": stock_info.get("description"),
        }

    def _build_fundamentals_context(self, stock_info: dict) -> dict:
        return {
            "price": stock_info.get("price"),
            "market_cap": stock_info.get("marketCap"),
            "enterprise_value": stock_info.get("enterpriseValue"),
            "trailing_pe": stock_info.get("trailingPE"),
            "forward_pe": stock_info.get("forwardPE"),
            "peg_ratio": stock_info.get("pegRatio"),
            "price_to_book": stock_info.get("priceToBook"),
            "price_to_sales": stock_info.get("priceToSales"),
            "enterprise_to_revenue": stock_info.get("enterpriseToRevenue"),
            "enterprise_to_ebitda": stock_info.get("enterpriseToEbitda"),
            "revenue": stock_info.get("revenue"),
            "revenue_growth": stock_info.get("revenueGrowth"),
            "gross_margin": stock_info.get("grossMargin"),
            "operating_margin": stock_info.get("operatingMargin"),
            "profit_margin": stock_info.get("profitMargin"),
            "eps": stock_info.get("eps"),
            "forward_eps": stock_info.get("forwardEps"),
            "roe": stock_info.get("roe"),
            "roa": stock_info.get("roa"),
            "debt_to_equity": stock_info.get("debtToEquity"),
            "current_ratio": stock_info.get("currentRatio"),
            "quick_ratio": stock_info.get("quickRatio"),
            "free_cashflow": stock_info.get("freeCashflow"),
            "book_value": stock_info.get("bookValue"),
            "shares_outstanding": stock_info.get("sharesOutstanding"),
            "earnings_growth": stock_info.get("earningsGrowth"),
            "dividend_yield": stock_info.get("dividendYield"),
            "dividend_rate": stock_info.get("dividendRate"),
            "payout_ratio": stock_info.get("payoutRatio"),
            "target_high_price": stock_info.get("targetHighPrice"),
            "target_low_price": stock_info.get("targetLowPrice"),
            "target_mean_price": stock_info.get("targetMeanPrice"),
            "recommendation_key": stock_info.get("recommendationKey"),
            "number_of_analyst_opinions": stock_info.get("numberOfAnalystOpinions"),
        }

    def _build_smart_analysis(self, stock_info: dict) -> dict:
        insights = stock_info.get("insights") or []
        valuation = stock_info.get("valuation") or {}
        composite = valuation.get("composite") or {}
        valuation_signal = composite.get("signal")

        positives = [item for item in insights if item.get("type") == "positive"]
        warnings = [item for item in insights if item.get("type") == "warning"]
        infos = [item for item in insights if item.get("type") == "info"]

        return {
            "verdict": _compute_verdict(insights, valuation_signal, stock_info),
            "valuation_signal": valuation_signal,
            "valuation_label": _valuation_label(valuation_signal),
            "technical_note": _get_technical_note(stock_info),
            "positives": positives,
            "warnings": warnings,
            "infos": infos,
        }

    async def _build_market_context(self, ticker: str) -> tuple[dict, dict]:
        stock_info = await market_service.get_stock_info(ticker)
        if not stock_info:
            raise ValueError(f"Ticker {ticker} not found")

        technical_data, historical_financials = await asyncio.gather(
            market_service.get_technical_indicators(ticker, period="3mo"),
            market_service.get_historical_financials(ticker),
        )
        technicals = {
            "summary": {
                "trend_signal": technical_data.get("trendSignal") if technical_data else None,
                "trend_description": technical_data.get("trendDescription") if technical_data else None,
                "rsi14": technical_data.get("rsi14") if technical_data else None,
                "rsi_signal": technical_data.get("rsiSignal") if technical_data else None,
                "macd_trend": technical_data.get("macdTrend") if technical_data else None,
                "price_vs_sma50": technical_data.get("priceVsSma50") if technical_data else None,
                "price_vs_sma200": technical_data.get("priceVsSma200") if technical_data else None,
                "bollinger_signal": technical_data.get("bollingerSignal") if technical_data else None,
                "volume_signal": technical_data.get("volumeSignal") if technical_data else None,
            },
        }

        market_context = {
            "fundamentals": self._build_fundamentals_context(stock_info),
            "historical_financials": historical_financials,
            "valuation": stock_info.get("valuation"),
            "smart_analysis": self._build_smart_analysis(stock_info),
            "technicals": technicals,
        }
        return stock_info, market_context

    async def get_stock_context(self, ticker: str, user_id: str) -> dict:
        normalized_ticker = ticker.upper()
        stock_info, market_context = await self._build_market_context(normalized_ticker)
        journal_context = await self._build_journal_context(
            normalized_ticker, user_id=user_id, full_report_limit=0
        )
        activity_context = await self._build_activity_context(
            normalized_ticker,
            user_id=user_id,
            stock_price=_coerce_float(stock_info.get("price")),
        )
        watchlist_context = await self._build_watchlist_context(normalized_ticker, user_id=user_id)

        return {
            "ticker": normalized_ticker,
            "generated_at": _iso_now(),
            "ticker_info": self._build_ticker_info(stock_info),
            "journal_context": journal_context,
            "activity_context": activity_context,
            "watchlist_context": watchlist_context,
            "market_context": market_context,
        }

    async def get_research_archive(self, ticker: str, user_id: str, limit: int = 10) -> dict:
        normalized_ticker = ticker.upper()
        channel = await journal_service.get_channel_by_ticker(normalized_ticker, user_id=user_id)
        if not channel:
            return {"ticker": normalized_ticker, "generated_at": _iso_now(), "reports": [], "notes": []}

        entries = await journal_service.get_entries(
            channel_id=channel["id"],
            limit=max(limit * 3, 30),
            user_id=user_id,
        )
        reports = [
            _serialize_ai_report(entry, include_full_content=False)
            for entry in entries
            if entry.get("type") == "ai_report"
        ][:limit]
        notes = [
            _serialize_journal_entry(entry)
            for entry in entries
            if entry.get("type") == "note"
        ][:limit]

        return {
            "ticker": normalized_ticker,
            "generated_at": _iso_now(),
            "reports": reports,
            "notes": notes,
        }

    async def get_report_content(self, report_id: str, user_id: str) -> dict:
        entry = supabase.table("journal_entries") \
            .select("id, created_at, content, metadata") \
            .eq("id", report_id) \
            .single() \
            .execute()
        row = entry.data
        if not row:
            raise ValueError(f"Report {report_id} not found")
        metadata = row.get("metadata") or {}
        return {
            "id": row.get("id"),
            "created_at": row.get("created_at"),
            "report_type": metadata.get("report_type"),
            "model": metadata.get("model"),
            "content": row.get("content") or "",
        }

    async def get_investment_activity(self, ticker: str, user_id: str) -> dict:
        normalized_ticker = ticker.upper()
        stock_info = await market_service.get_stock_info(normalized_ticker)
        stock_price = _coerce_float(stock_info.get("price")) if stock_info else None
        activity_context = await self._build_activity_context(
            normalized_ticker,
            user_id=user_id,
            stock_price=stock_price,
        )
        return {
            "ticker": normalized_ticker,
            "generated_at": _iso_now(),
            **activity_context,
        }

    async def get_technical_history(
        self,
        ticker: str,
        user_id: str,
        period: TechnicalPeriod = "6mo",
        indicators: Optional[Iterable[str]] = None,
    ) -> dict:
        del user_id  # authenticated caller required, but no extra per-user filtering here
        normalized_ticker = ticker.upper()
        if period not in VALID_TECHNICAL_PERIODS:
            raise ValueError(
                f"Unsupported technical period '{period}'. Expected one of: {', '.join(sorted(VALID_TECHNICAL_PERIODS))}"
            )
        technical_data = await market_service.get_technical_indicators(normalized_ticker, period=period)
        if not technical_data:
            raise ValueError(f"Technical data for {normalized_ticker} are not available")

        selected = {item.strip() for item in indicators or [] if item.strip()} or None
        return {
            "ticker": normalized_ticker,
            "generated_at": _iso_now(),
            "period": period,
            "summary": {
                "trend_signal": technical_data.get("trendSignal"),
                "trend_description": technical_data.get("trendDescription"),
                "rsi14": technical_data.get("rsi14"),
                "rsi_signal": technical_data.get("rsiSignal"),
                "macd_trend": technical_data.get("macdTrend"),
                "bollinger_signal": technical_data.get("bollingerSignal"),
                "volume_signal": technical_data.get("volumeSignal"),
            },
            "history": _pick_technical_history(technical_data, indicators=selected),
        }


research_context_service = ResearchContextService()
