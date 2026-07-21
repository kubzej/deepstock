from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.core.cache import CacheTTL
from app.core.config import get_settings
from app.core.redis import get_redis
from app.services.daily_news_scoring import SourceCandidate, bounded_raw_payload

logger = logging.getLogger(__name__)

COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
IMPORTANT_FORMS = {"8-K", "10-Q", "10-K", "6-K", "S-1", "SC 13D", "SC 13G", "13D", "13G", "4"}


class EdgarError(Exception):
    pass


class EdgarUnsupportedTicker(Exception):
    pass


class EdgarClient:
    def __init__(self):
        self.settings = get_settings()

    @property
    def headers(self) -> dict[str, str]:
        return {"User-Agent": self.settings.sec_user_agent}

    async def _get_json(self, url: str, cache_key: str, ttl: int) -> dict:
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        try:
            async with httpx.AsyncClient(timeout=15.0, headers=self.headers) as client:
                response = await client.get(url)
        except httpx.TimeoutException as exc:
            raise EdgarError("SEC EDGAR timeout") from exc
        except httpx.RequestError as exc:
            raise EdgarError(f"SEC EDGAR network error: {exc}") from exc

        if response.status_code == 404:
            raise EdgarUnsupportedTicker("Ticker not found in SEC EDGAR")
        if response.status_code >= 400:
            raise EdgarError(f"SEC EDGAR upstream error: HTTP {response.status_code}")

        payload = response.json()
        await redis.setex(cache_key, ttl, json.dumps(payload))
        return payload

    async def _ticker_cik_map(self) -> dict[str, str]:
        payload = await self._get_json(
            COMPANY_TICKERS_URL,
            "daily_news:edgar:company_tickers",
            CacheTTL.SEC_CIK_MAP,
        )
        result = {}
        for row in payload.values():
            ticker = str(row.get("ticker") or "").upper()
            cik = row.get("cik_str")
            if ticker and cik:
                result[ticker] = str(cik).zfill(10)
        return result

    async def resolve_cik(self, ticker: str) -> Optional[str]:
        mapping = await self._ticker_cik_map()
        return mapping.get(ticker.upper())

    async def fetch_recent_filings(
        self,
        ticker: str,
        *,
        priority: str,
        window_start: datetime,
        window_end: datetime,
        scope_type: str = "holding",
    ) -> list[SourceCandidate]:
        cik = await self.resolve_cik(ticker)
        if not cik:
            raise EdgarUnsupportedTicker(f"{ticker.upper()} is not in SEC company ticker map")

        payload = await self._get_json(
            SUBMISSIONS_URL.format(cik=cik),
            f"daily_news:edgar:submissions:{cik}",
            CacheTTL.DAILY_NEWS_EDGAR_FILINGS,
        )
        recent = payload.get("filings", {}).get("recent", {})
        forms = recent.get("form") or []
        dates = recent.get("filingDate") or []
        report_dates = recent.get("reportDate") or []
        accession_numbers = recent.get("accessionNumber") or []
        primary_docs = recent.get("primaryDocument") or []
        descriptions = recent.get("primaryDocDescription") or []

        candidates = []
        for idx, form_type in enumerate(forms):
            form = str(form_type or "").upper()
            if form not in IMPORTANT_FORMS:
                continue
            published_at = _date_to_dt(dates[idx] if idx < len(dates) else None)
            if published_at and not (window_start <= published_at <= window_end):
                continue
            accession = accession_numbers[idx] if idx < len(accession_numbers) else ""
            doc = primary_docs[idx] if idx < len(primary_docs) else ""
            url = _filing_url(cik, accession, doc) if accession and doc else None
            title = f"{ticker.upper()} filed {form}"
            description = descriptions[idx] if idx < len(descriptions) else None
            if description:
                title = f"{title}: {description}"
            candidates.append(
                SourceCandidate(
                    title=title,
                    snippet=f"SEC filing {form}" + (f", report date {report_dates[idx]}" if idx < len(report_dates) and report_dates[idx] else ""),
                    url=url,
                    source_name="SEC EDGAR",
                    published_at=published_at,
                    ticker=ticker.upper(),
                    scope_type=scope_type,  # type: ignore[arg-type]
                    scope_priority=priority,  # type: ignore[arg-type]
                    source_type="edgar",
                    raw_payload=bounded_raw_payload({
                        "cik": cik,
                        "form_type": form,
                        "accession_number": accession,
                        "filing_date": dates[idx] if idx < len(dates) else None,
                        "report_date": report_dates[idx] if idx < len(report_dates) else None,
                        "primary_document": doc,
                        "description": description,
                    }),
                )
            )
        return candidates


def _date_to_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _filing_url(cik: str, accession: str, primary_doc: str) -> str:
    accession_path = accession.replace("-", "")
    cik_path = str(int(cik))
    return f"https://www.sec.gov/Archives/edgar/data/{cik_path}/{accession_path}/{primary_doc}"


edgar_client = EdgarClient()
