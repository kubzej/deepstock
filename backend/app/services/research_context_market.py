"""
Market and ticker-focused helpers for the MCP research context surface.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Iterable, Literal, Optional

import httpx

from app.core.cache import CacheTTL
from app.core.redis import get_redis
from app.services.exchange import exchange_service
from app.services.market import market_service

TechnicalPeriod = Literal["1w", "1mo", "3mo", "6mo", "1y", "2y"]
VALID_TECHNICAL_PERIODS: set[str] = {"1w", "1mo", "3mo", "6mo", "1y", "2y"}
VALID_TECHNICAL_INDICATORS: set[str] = {
    "price",
    "rsi",
    "macd",
    "bollinger",
    "volume",
    "stochastic",
    "atr",
    "obv",
    "adx",
    "fibonacci",
}

MACRO_MARKET_INDICATORS = [
    {
        "ticker": "GLD",
        "name": "Zlato",
        "description": "Safe haven. Roste pri nejistote a inflaci.",
        "inverted": False,
    },
    {
        "ticker": "TLT",
        "name": "Dluhopisy 20Y",
        "description": "Dlouhodobe US Treasury. Roste = flight to safety, pada = sazby nahoru.",
        "inverted": False,
    },
    {
        "ticker": "HYG",
        "name": "High Yield",
        "description": "Junk bonds. Kdyz pada = risk-off, investori se boji.",
        "inverted": False,
    },
    {
        "ticker": "UUP",
        "name": "Dolar",
        "description": "Silny dolar = tlak na emerging markets a komodity.",
        "inverted": False,
    },
    {
        "ticker": "USO",
        "name": "Ropa",
        "description": "Cena ropy. Ovlivnuje inflaci a energeticky sektor.",
        "inverted": False,
    },
]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _valuation_label(signal: Optional[str]) -> dict[str, Optional[str]]:
    mapping = {
        "undervalued": {"text": "Podhodnocená", "tone": "positive"},
        "slightly_undervalued": {"text": "Mírně podhodnocená", "tone": "positive"},
        "fair": {"text": "Férová cena", "tone": "neutral"},
        "slightly_overvalued": {"text": "Mírně nadhodnocená", "tone": "warning"},
        "overvalued": {"text": "Nadhodnocená", "tone": "negative"},
        "hold": {"text": "Neutrální", "tone": "neutral"},
    }
    return mapping.get(signal or "", {"text": "Bez dat", "tone": "neutral"})


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


class MarketContextService:
    async def get_fear_greed_snapshot(self) -> dict:
        redis = get_redis()
        cache_key = "market:fear_greed"
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
                headers={"User-Agent": "Mozilla/5.0 (compatible; DeepStock/1.0)"},
            )
            response.raise_for_status()
            raw = response.json()

        fg = raw["fear_and_greed"]
        result = {
            "score": round(fg["score"], 1),
            "rating": fg["rating"],
            "previousClose": round(fg["previous_close"], 1),
            "previousWeek": round(fg["previous_1_week"], 1),
            "previousMonth": round(fg["previous_1_month"], 1),
            "previousYear": round(fg["previous_1_year"], 1),
        }
        await redis.setex(cache_key, CacheTTL.FEAR_GREED, json.dumps(result))
        return result

    def build_ticker_info(self, stock_info: dict) -> dict:
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

    def build_fundamentals_context(self, stock_info: dict) -> dict:
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

    def build_smart_analysis(self, stock_info: dict) -> dict:
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

    async def build_market_context(self, ticker: str) -> tuple[dict, dict]:
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
            "fundamentals": self.build_fundamentals_context(stock_info),
            "historical_financials": historical_financials,
            "valuation": stock_info.get("valuation"),
            "smart_analysis": self.build_smart_analysis(stock_info),
            "technicals": technicals,
        }
        return stock_info, market_context

    async def get_stock_context(
        self,
        ticker: str,
        user_id: str,
        *,
        activity_context_builder,
        journal_context_builder,
        watchlist_context_builder,
    ) -> dict:
        normalized_ticker = ticker.upper()
        stock_info, market_context = await self.build_market_context(normalized_ticker)
        journal_context = await journal_context_builder(normalized_ticker, user_id=user_id)
        activity_context = await activity_context_builder(
            normalized_ticker,
            user_id=user_id,
            stock_price=_coerce_float(stock_info.get("price")),
        )
        watchlist_context = await watchlist_context_builder(normalized_ticker, user_id=user_id)

        return {
            "ticker": normalized_ticker,
            "generated_at": _iso_now(),
            "ticker_info": self.build_ticker_info(stock_info),
            "journal_context": journal_context,
            "activity_context": activity_context,
            "watchlist_context": watchlist_context,
            "market_context": market_context,
        }

    async def get_technical_history(
        self,
        ticker: str,
        user_id: str,
        period: TechnicalPeriod = "6mo",
        indicators: Optional[Iterable[str]] = None,
    ) -> dict:
        del user_id
        normalized_ticker = ticker.upper()
        if period not in VALID_TECHNICAL_PERIODS:
            raise ValueError(
                f"Unsupported technical period '{period}'. Expected one of: {', '.join(sorted(VALID_TECHNICAL_PERIODS))}"
            )
        selected = {item.strip() for item in indicators or [] if item.strip()} or None
        if selected:
            invalid_indicators = sorted(selected - VALID_TECHNICAL_INDICATORS)
            if invalid_indicators:
                raise ValueError(
                    "Unsupported technical indicators: "
                    + ", ".join(invalid_indicators)
                    + ". Expected a subset of: "
                    + ", ".join(sorted(VALID_TECHNICAL_INDICATORS))
                )
        technical_data = await market_service.get_technical_indicators(normalized_ticker, period=period)
        if not technical_data:
            raise ValueError(f"Technical data for {normalized_ticker} are not available")

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

    async def get_market_context(self, user_id: str) -> dict:
        del user_id
        fear_greed, exchange_rates, macro_quotes = await asyncio.gather(
            self.get_fear_greed_snapshot(),
            exchange_service.get_rates(),
            market_service.get_quotes([item["ticker"] for item in MACRO_MARKET_INDICATORS]),
        )
        selected_rates = {
            currency: float(exchange_rates.get(currency, 1.0))
            for currency in ["USD", "EUR", "GBP", "CZK"]
            if currency in exchange_rates
        }
        macro_context = []
        for item in MACRO_MARKET_INDICATORS:
            quote = macro_quotes.get(item["ticker"], {})
            macro_context.append({
                "ticker": item["ticker"],
                "name": item["name"],
                "description": item["description"],
                "inverted": item["inverted"],
                "price": _coerce_float(quote.get("price")),
                "change_percent": _coerce_float(quote.get("changePercent")),
                "volume": _coerce_float(quote.get("volume")),
                "avg_volume": _coerce_float(quote.get("avgVolume")),
                "last_updated": quote.get("lastUpdated"),
            })
        return {
            "generated_at": _iso_now(),
            "sentiment": {
                "score": _coerce_float(fear_greed.get("score")),
                "rating": fear_greed.get("rating"),
                "previous_close": _coerce_float(fear_greed.get("previousClose")),
                "previous_week": _coerce_float(fear_greed.get("previousWeek")),
                "previous_month": _coerce_float(fear_greed.get("previousMonth")),
                "previous_year": _coerce_float(fear_greed.get("previousYear")),
            },
            "fx": {"rates_to_czk": selected_rates},
            "macro_quotes": macro_context,
        }


market_context_service = MarketContextService()
