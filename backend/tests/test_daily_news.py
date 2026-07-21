from datetime import datetime, timedelta, timezone

import pytest

from app.services.daily_news_marketaux import MarketauxClient, _format_marketaux_datetime
from app.services.daily_news import (
    _build_notification_body,
    _extract_summary,
    _local_day_bounds_utc,
)
from app.services.daily_news_scoring import SourceCandidate, bounded_raw_payload, score_candidates
from app.core.config import Settings


def test_daily_news_scoring_dedupes_and_marks_prompt_items():
    window_end = datetime(2026, 7, 15, 14, 0, tzinfo=timezone.utc)
    candidates = [
        SourceCandidate(
            title="Company files 8-K",
            source_type="edgar",
            scope_type="holding",
            scope_priority="high",
            ticker="NVDA",
            published_at=window_end - timedelta(hours=1),
            raw_payload={"accession_number": "abc", "form_type": "8-K", "description": "Material acquisition agreement"},
        ),
        SourceCandidate(
            title="Company files 8-K duplicate",
            source_type="edgar",
            scope_type="holding",
            scope_priority="high",
            ticker="NVDA",
            published_at=window_end - timedelta(hours=1),
            raw_payload={"accession_number": "abc", "form_type": "8-K", "description": "Material acquisition agreement"},
        ),
        SourceCandidate(
            title="Generic sector note",
            source_type="marketaux",
            scope_type="sector",
            scope_priority="low",
            published_at=window_end - timedelta(hours=20),
        ),
    ]

    scored = score_candidates(candidates, window_end)

    assert len(scored) == 2
    assert scored[0].ticker == "NVDA"
    assert scored[0].importance == "high"
    assert scored[0].used_in_prompt is True
    assert scored[0].dedupe_key


def test_edgar_filing_without_description_is_capped_below_high():
    window_end = datetime(2026, 7, 15, 14, 0, tzinfo=timezone.utc)
    bare_filing = SourceCandidate(
        title="ABT filed 8-K",
        source_type="edgar",
        scope_type="holding",
        scope_priority="high",
        ticker="ABT",
        published_at=window_end - timedelta(hours=1),
        raw_payload={"accession_number": "xyz", "form_type": "8-K"},
    )

    scored = score_candidates([bare_filing], window_end)

    assert scored[0].importance == "low"


def test_marketaux_match_score_and_sentiment_label_feed_scoring():
    window_end = datetime(2026, 7, 15, 14, 0, tzinfo=timezone.utc)
    weak_match = SourceCandidate(
        title="Generic SCHD dividend roundup",
        source_type="marketaux",
        scope_type="holding",
        scope_priority="high",
        ticker="ABT",
        match_score=5.0,
        sentiment_score=0.6,
        published_at=window_end - timedelta(hours=1),
    )
    strong_match = SourceCandidate(
        title="ABT reports Q2 earnings",
        source_type="marketaux",
        scope_type="holding",
        scope_priority="high",
        ticker="ABT",
        match_score=95.0,
        sentiment_score=-0.6,
        published_at=window_end - timedelta(hours=1),
    )

    scored = score_candidates([weak_match, strong_match], window_end)
    by_title = {item.title: item for item in scored}

    assert by_title["ABT reports Q2 earnings"].relevance_score > by_title["Generic SCHD dividend roundup"].relevance_score
    assert by_title["ABT reports Q2 earnings"].sentiment_label == "negative"
    assert by_title["Generic SCHD dividend roundup"].sentiment_label == "positive"


def test_bounded_raw_payload_redacts_and_truncates():
    payload = bounded_raw_payload(
        {
            "api_token": "secret",
            "description": "x" * 3000,
            "items": [{"nested": "ok"} for _ in range(25)],
        }
    )

    assert "api_token" not in payload
    assert len(payload["description"]) == 2000
    assert len(payload["items"]) == 20


def test_format_marketaux_datetime_uses_utc_without_timezone_suffix():
    value = datetime(2026, 7, 16, 8, 49, 12, tzinfo=timezone.utc)

    assert _format_marketaux_datetime(value) == "2026-07-16T08:49:12"


def test_marketaux_defaults_fit_free_tier_baseline():
    settings = Settings()

    assert settings.marketaux_symbols_per_request == 1
    assert settings.marketaux_articles_per_request == 3
    assert settings.marketaux_request_delay_seconds >= 2


@pytest.mark.asyncio
async def test_marketaux_ticker_request_uses_supported_date_params(monkeypatch):
    captured: dict[str, object] = {}
    client = MarketauxClient()

    async def fake_request(params):
        captured.update(params)
        return {"data": []}

    monkeypatch.setattr(client, "_request", fake_request)

    await client.fetch_for_ticker(
        "nvda",
        scope_type="holding",
        priority="high",
        window_start=datetime(2026, 7, 15, 8, 49, tzinfo=timezone.utc),
        window_end=datetime(2026, 7, 16, 8, 49, tzinfo=timezone.utc),
    )

    assert captured["symbols"] == "NVDA"
    assert captured["published_after"] == "2026-07-15T08:49:00"
    assert captured["published_before"] == "2026-07-16T08:49:00"
    assert "sort" not in captured


@pytest.mark.asyncio
async def test_marketaux_batch_request_uses_comma_separated_symbols(monkeypatch):
    captured: dict[str, object] = {}
    client = MarketauxClient()

    async def fake_request(params):
        captured.update(params)
        return {
            "data": [
                {
                    "uuid": "1",
                    "title": "PayPal takeover report",
                    "entities": [{"symbol": "PYPL"}],
                    "published_at": "2026-07-16T08:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(client, "_request", fake_request)

    candidates = await client.fetch_for_tickers(
        [
            {"ticker": "PYPL", "scope_type": "holding", "priority": "high"},
            {"ticker": "SOFI", "scope_type": "watchlist", "priority": "medium"},
        ],
        window_start=datetime(2026, 7, 15, 8, 49, tzinfo=timezone.utc),
        window_end=datetime(2026, 7, 16, 8, 49, tzinfo=timezone.utc),
    )

    assert captured["symbols"] == "PYPL,SOFI"
    assert captured["must_have_entities"] == "true"
    assert candidates[0].ticker == "PYPL"
    assert candidates[0].scope_type == "holding"
    assert candidates[0].scope_priority == "high"


def test_extract_summary_skips_window_and_cleans_markdown():
    summary = _extract_summary(
        """
# Denní briefing
**Okno:** 15. 7. 2026 08:49 → 16. 7. 2026 08:49 UTC
**Prakticky žádná zpravodajská data.** Marketaux selhal.
Další věta.
"""
    )

    assert summary.startswith("Prakticky žádná zpravodajská data.")
    assert "**" not in summary
    assert "Okno" not in summary


def test_build_notification_body_skips_window_and_truncates_cleanly():
    body = _build_notification_body(
        """
# Denní briefing
**Okno:** 15. 7. 2026 09:11 – 16. 7. 2026 09:11 UTC
## Rychlý verdikt
- **PYPL:** převzetí Stripe/Advent za ~53 mld. USD je hlavní událost dne — akcie skočily po nabídce.
"""
    )

    assert body.startswith("PYPL:")
    assert "Okno" not in body
    assert "**" not in body
    assert len(body) <= 113


def test_local_day_bounds_use_prague_day_in_utc():
    start, end = _local_day_bounds_utc(datetime(2026, 7, 16, 9, 11, tzinfo=timezone.utc))

    assert start == datetime(2026, 7, 15, 22, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 7, 16, 22, 0, tzinfo=timezone.utc)
