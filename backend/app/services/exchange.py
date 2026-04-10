import httpx
import json
import logging
from typing import Dict
from app.core.redis import get_redis
from app.core.cache import CacheTTL
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Czech National Bank daily rate feed (English version, dot as decimal separator)
CNB_URL = (
    "https://www.cnb.cz/en/financial_markets/"
    "foreign_exchange_market/exchange_rate_fixing/daily.txt"
)

_LIVE_KEY = "exchange_rates:czk"
_LKG_KEY = "exchange_rates:czk:last_known_good"
_LKG_TTL = 86400  # 24 hours


def _parse_cnb(text: str) -> Dict[str, float]:
    """
    Parse CNB daily rate text.

    Format:
        11 Apr 2026 #70
        Country|Currency|Amount|Code|Rate
        Australia|dollar|1|AUD|14.289
        ...
    Rate column is per `Amount` units — divide to get per-unit rate.
    """
    rates: Dict[str, float] = {"CZK": 1.0}
    lines = text.strip().splitlines()

    for line in lines[2:]:  # skip date line + header line
        parts = line.strip().split("|")
        if len(parts) < 5:
            continue
        try:
            amount = float(parts[2])
            code = parts[3].strip()
            rate = float(parts[4].replace(",", "."))
            if amount > 0:
                rates[code] = round(rate / amount, 4)
        except (ValueError, IndexError):
            continue

    return rates


class ExchangeRateService:
    def __init__(self) -> None:
        self.redis = get_redis()

    async def get_rates(self) -> Dict[str, float]:
        """
        Return CZK exchange rates.

        Priority:
          1. Redis live cache (1 h TTL) — fastest path
          2. CNB live fetch — store as live cache + last-known-good
          3. Redis last-known-good cache (24 h TTL) — CNB temporarily down
          4. Raise HTTP 503 — both sources failed, no cached data

        Never returns hardcoded fallback values.
        """
        # 1. Live Redis cache
        cached = await self.redis.get(_LIVE_KEY)
        if cached:
            return json.loads(cached)

        # 2. Fetch from CNB
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(CNB_URL)
                response.raise_for_status()
                rates = _parse_cnb(response.text)

            if len(rates) < 5:
                raise ValueError(f"CNB parse returned only {len(rates)} rates — likely malformed response")

            await self.redis.set(_LIVE_KEY, json.dumps(rates), ex=CacheTTL.EXCHANGE_RATES)
            await self.redis.set(_LKG_KEY, json.dumps(rates), ex=_LKG_TTL)
            logger.info("Exchange rates refreshed from CNB (%d currencies)", len(rates))
            return rates

        except Exception as exc:
            logger.error("CNB exchange rate fetch failed: %s", exc)

        # 3. Last-known-good fallback
        lkg = await self.redis.get(_LKG_KEY)
        if lkg:
            logger.warning("Using last-known-good exchange rates (CNB unavailable)")
            return json.loads(lkg)

        # 4. Total failure
        raise HTTPException(
            status_code=503,
            detail="Exchange rates unavailable — CNB fetch failed and no cached data exists.",
        )

    async def convert_to_czk(self, amount: float, from_currency: str) -> float:
        """Convert amount from given currency to CZK."""
        if from_currency == "CZK":
            return amount
        rates = await self.get_rates()
        rate = rates.get(from_currency, 1.0)
        return round(amount * rate, 2)


exchange_service = ExchangeRateService()
