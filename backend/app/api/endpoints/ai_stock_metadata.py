"""
AI stock metadata endpoint.

POST /api/ai/stock-metadata — suggest missing stock metadata from a ticker
"""
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.requests import Request

from app.ai.prompts.stock_metadata_prompt import (
    MAX_NOTES_CHARS,
    SYSTEM_PROMPT,
    build_user_prompt,
)
from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.core.redis import get_redis
from app.services.market import market_service
from app.services.market.stock_info import StockInfoUnavailableError

logger = logging.getLogger(__name__)

router = APIRouter()

SUPPORTED_CURRENCIES = {
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CHF",
    "CAD",
    "AUD",
    "CNY",
    "CZK",
    "HKD",
    "SEK",
    "DKK",
    "NOK",
    "PLN",
    "HUF",
}

EXCHANGE_ALIASES = {
    "NASDAQ": "NASDAQ",
    "NMS": "NASDAQ",
    "NGM": "NASDAQ",
    "NCM": "NASDAQ",
    "NAS": "NASDAQ",
    "NYSE": "NYSE",
    "NYQ": "NYSE",
    "PCX": "NYSE",
    "LSE": "LSE",
    "LON": "LSE",
    "XETRA": "XETRA",
    "GER": "XETRA",
    "DEU": "XETRA",
    "SIX": "SIX",
    "EBS": "SIX",
    "TSX": "TSX",
    "TOR": "TSX",
    "ASX": "ASX",
    "JPX": "JPX",
    "TSE": "JPX",
    "TYO": "JPX",
    "OSA": "JPX",
    "SSE": "SSE",
    "SHH": "SSE",
    "HKEX": "HKEX",
    "HKG": "HKEX",
    "PSE": "PSE",
    "OMX-STO": "OMX-STO",
    "STO": "OMX-STO",
    "OSL": "OSL",
    "VIE": "VIE",
    "WSE": "WSE",
    "PSE-PRA": "PSE-PRA",
    "PRA": "PSE-PRA",
    "EURONEXT-PARIS": "EURONEXT-PARIS",
    "PAR": "EURONEXT-PARIS",
}

TICKER_SUFFIX_EXCHANGES = {
    "L": "LSE",
    "DE": "XETRA",
    "SW": "SIX",
    "TO": "TSX",
    "AX": "ASX",
    "T": "JPX",
    "HK": "HKEX",
    "ST": "OMX-STO",
    "OL": "OSL",
    "VI": "VIE",
    "WA": "WSE",
    "PR": "PSE-PRA",
    "PA": "EURONEXT-PARIS",
}

COUNTRY_ALIASES = {
    "united states": "US",
    "usa": "US",
    "us": "US",
    "united kingdom": "UK",
    "uk": "UK",
    "great britain": "UK",
    "germany": "DE",
    "switzerland": "CH",
    "canada": "CA",
    "australia": "AU",
    "japan": "JP",
    "china": "CN",
    "hong kong": "HK",
    "sweden": "SE",
    "norway": "NO",
    "austria": "AT",
    "poland": "PL",
    "czech republic": "CZ",
    "czechia": "CZ",
    "france": "FR",
    "netherlands": "NL",
}

EXCHANGE_COUNTRIES = {
    "NASDAQ": "US",
    "NYSE": "US",
    "LSE": "UK",
    "XETRA": "DE",
    "SIX": "CH",
    "TSX": "CA",
    "ASX": "AU",
    "JPX": "JP",
    "SSE": "CN",
    "HKEX": "HK",
    "PSE": "PH",
    "OMX-STO": "SE",
    "OSL": "NO",
    "VIE": "AT",
    "WSE": "PL",
    "PSE-PRA": "CZ",
    "EURONEXT-PARIS": "FR",
}


class StockMetadataRequest(BaseModel):
    ticker: str


class StockMetadataResponse(BaseModel):
    ticker: str
    name: Optional[str] = None
    sector: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    country: Optional[str] = None
    price_scale: Optional[float] = None
    notes: Optional[str] = None
    cached: bool = False
    used_ai: bool = False


def _normalize_ticker(raw_ticker: str) -> str:
    return raw_ticker.strip().upper()


def _ticker_suffix(ticker: str) -> Optional[str]:
    parts = ticker.split(".")
    if len(parts) == 2 and parts[1]:
        return parts[1].upper()
    return None


def _normalize_exchange(raw_exchange: Optional[str], ticker: str) -> Optional[str]:
    suffix = _ticker_suffix(ticker)
    if suffix and suffix in TICKER_SUFFIX_EXCHANGES:
        return TICKER_SUFFIX_EXCHANGES[suffix]
    if not raw_exchange:
        return None
    return EXCHANGE_ALIASES.get(raw_exchange.strip().upper(), "Other")


def _normalize_currency(raw_currency: Optional[str]) -> Optional[str]:
    if not raw_currency:
        return None
    currency = raw_currency.strip().upper()
    return currency if currency in SUPPORTED_CURRENCIES else None


def _normalize_country(raw_country: Optional[str], exchange: Optional[str]) -> Optional[str]:
    if raw_country:
        normalized = COUNTRY_ALIASES.get(raw_country.strip().lower())
        if normalized:
            return normalized

        raw_country = raw_country.strip().upper()
        if len(raw_country) == 2:
            return raw_country

    if exchange:
        return EXCHANGE_COUNTRIES.get(exchange)
    return None


def _infer_price_scale(exchange: Optional[str], ticker: str) -> float:
    suffix = _ticker_suffix(ticker)
    if exchange == "LSE" or suffix == "L":
        return 0.01
    return 1.0


def _fallback_notes(
    name: Optional[str],
    sector: Optional[str],
    country: Optional[str],
    description: Optional[str],
) -> Optional[str]:
    if description:
        cleaned = re.sub(r"\s+", " ", description).strip()
        if len(cleaned) > MAX_NOTES_CHARS:
            cleaned = cleaned[: MAX_NOTES_CHARS - 3].rstrip(" ,.;:") + "..."
        return cleaned

    parts = []
    if name:
        parts.append(name)
    if sector:
        parts.append(f"působí v sektoru {sector}")
    if country:
        parts.append(f"({country})")
    if not parts:
        return None
    text = " ".join(parts).strip()
    if len(text) > MAX_NOTES_CHARS:
        return text[: MAX_NOTES_CHARS - 3].rstrip(" ,.;:") + "..."
    return text


def _clean_ai_notes(content: str) -> str:
    cleaned = content.strip()
    cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip().strip('"')
    cleaned = re.sub(r"\s+", " ", cleaned)
    if len(cleaned) > MAX_NOTES_CHARS:
        cleaned = cleaned[: MAX_NOTES_CHARS - 3].rstrip(" ,.;:") + "..."
    return cleaned


async def _generate_ai_notes(stock_info: dict) -> tuple[Optional[str], bool]:
    description = stock_info.get("description")
    if not description:
        return None, False

    try:
        from app.ai.providers.litellm_client import call_llm

        content, _ = await call_llm(
            SYSTEM_PROMPT,
            build_user_prompt(
                ticker=stock_info.get("symbol", ""),
                name=stock_info.get("name"),
                sector=stock_info.get("sector"),
                industry=stock_info.get("industry"),
                country=stock_info.get("country"),
                description=description,
            ),
            request_timeout=90,
        )
        cleaned = _clean_ai_notes(content)
        return (cleaned or None), bool(cleaned)
    except Exception as exc:
        logger.warning(
            "AI stock metadata notes generation failed for %s: %s",
            stock_info.get("symbol"),
            exc,
        )
        return None, False


@router.post("/stock-metadata", response_model=StockMetadataResponse)
@limiter.limit("20/hour")
async def generate_stock_metadata(
    request: Request,
    payload: StockMetadataRequest,
    user_id: str = Depends(get_current_user_id),
):
    ticker = _normalize_ticker(payload.ticker)
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker je povinný")

    cache_key = f"ai_stock_metadata:{ticker}"
    redis = get_redis()
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return StockMetadataResponse(**data, cached=True)

    try:
        stock_info = await market_service.get_stock_info(ticker)
    except StockInfoUnavailableError:
        raise HTTPException(
            status_code=503,
            detail=f"Metadata pro {ticker} jsou teď dočasně nedostupná. Zkus to znovu později.",
        )
    except Exception as exc:
        logger.error("Unexpected stock metadata error for %s: %s", ticker, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Nepodařilo se načíst metadata akcie.",
        )

    if not stock_info:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} se nepodařilo najít.")

    exchange = _normalize_exchange(stock_info.get("exchange"), ticker)
    country = _normalize_country(stock_info.get("country"), exchange)
    notes, used_ai = await _generate_ai_notes(stock_info)
    if not notes:
        notes = _fallback_notes(
            name=stock_info.get("name"),
            sector=stock_info.get("sector"),
            country=country,
            description=stock_info.get("description"),
        )

    response_data = {
        "ticker": ticker,
        "name": stock_info.get("name"),
        "sector": stock_info.get("sector"),
        "exchange": exchange,
        "currency": _normalize_currency(stock_info.get("currency")),
        "country": country,
        "price_scale": _infer_price_scale(exchange, ticker),
        "notes": notes,
        "used_ai": used_ai,
    }

    await redis.set(cache_key, json.dumps(response_data), ex=21600)
    return StockMetadataResponse(**response_data, cached=False)
