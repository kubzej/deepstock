from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Optional

Priority = Literal["high", "medium", "low"]
ScopeType = Literal["holding", "watchlist", "market", "macro", "sector"]
SourceType = Literal["marketaux", "edgar", "deepstock_market"]
Importance = Literal["high", "medium", "low", "noise"]

PRIORITY_WEIGHT = {"high": 40.0, "medium": 24.0, "low": 12.0}
SCOPE_WEIGHT = {"holding": 28.0, "watchlist": 20.0, "market": 10.0, "macro": 12.0, "sector": 14.0}
SOURCE_WEIGHT = {"edgar": 28.0, "marketaux": 14.0, "deepstock_market": 10.0}
MAX_PROMPT_ITEMS = 30
MAX_PERSISTED_ITEMS = 80
MAX_RAW_STRING = 2000


@dataclass
class SourceCandidate:
    title: str
    source_type: SourceType
    scope_type: ScopeType
    ticker: Optional[str] = None
    scope_priority: Optional[Priority] = None
    snippet: Optional[str] = None
    url: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[datetime] = None
    raw_payload: dict[str, Any] = field(default_factory=dict)
    relevance_score: float = 0.0
    importance: Importance = "low"
    used_in_prompt: bool = False
    dedupe_key: Optional[str] = None


def _normalize_text(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    normalized = re.sub(r"[^a-z0-9 ]+", "", normalized)
    return normalized


def _coerce_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def bounded_raw_payload(payload: dict[str, Any], max_depth: int = 2) -> dict[str, Any]:
    def bound(value: Any, depth: int) -> Any:
        if depth > max_depth:
            return "[truncated]"
        if isinstance(value, dict):
            return {
                str(k)[:80]: bound(v, depth + 1)
                for k, v in list(value.items())[:40]
                if str(k).lower() not in {"api_token", "apikey", "authorization"}
            }
        if isinstance(value, list):
            return [bound(item, depth + 1) for item in value[:20]]
        if isinstance(value, str):
            return value[:MAX_RAW_STRING]
        if isinstance(value, (int, float, bool)) or value is None:
            return value
        return str(value)[:MAX_RAW_STRING]

    return bound(payload or {}, 0)


def make_dedupe_key(candidate: SourceCandidate) -> str:
    if candidate.raw_payload.get("accession_number"):
        base = f"edgar:{candidate.raw_payload['accession_number']}"
    elif candidate.raw_payload.get("uuid"):
        base = f"marketaux:{candidate.raw_payload['uuid']}"
    elif candidate.url:
        base = f"url:{candidate.url.strip().lower()}"
    else:
        base = f"title:{candidate.ticker or ''}:{_normalize_text(candidate.title)[:120]}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def score_candidates(candidates: list[SourceCandidate], window_end: datetime) -> list[SourceCandidate]:
    seen: set[str] = set()
    scored: list[SourceCandidate] = []

    for candidate in candidates:
        candidate.published_at = _coerce_dt(candidate.published_at)
        candidate.raw_payload = bounded_raw_payload(candidate.raw_payload)
        candidate.dedupe_key = make_dedupe_key(candidate)
        if candidate.dedupe_key in seen:
            continue
        seen.add(candidate.dedupe_key)

        score = SOURCE_WEIGHT.get(candidate.source_type, 0.0)
        score += SCOPE_WEIGHT.get(candidate.scope_type, 0.0)
        score += PRIORITY_WEIGHT.get(candidate.scope_priority or "low", 0.0)

        if candidate.published_at:
            age_hours = max(0.0, (window_end - candidate.published_at).total_seconds() / 3600)
            score += max(0.0, 18.0 - (age_hours * 0.75))

        form_type = str(candidate.raw_payload.get("form_type") or "").upper()
        if form_type in {"8-K", "10-Q", "10-K", "6-K"}:
            score += 20.0
        elif form_type in {"S-1", "SC 13D", "SC 13G", "13D", "13G", "4"}:
            score += 12.0

        candidate.relevance_score = round(score, 2)
        if score >= 75:
            candidate.importance = "high"
        elif score >= 52:
            candidate.importance = "medium"
        elif score >= 24:
            candidate.importance = "low"
        else:
            candidate.importance = "noise"
        scored.append(candidate)

    scored.sort(key=lambda item: (item.relevance_score, item.published_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)

    for index, candidate in enumerate(scored[:MAX_PERSISTED_ITEMS]):
        candidate.used_in_prompt = index < MAX_PROMPT_ITEMS and candidate.importance != "noise"

    return scored[:MAX_PERSISTED_ITEMS]


def candidate_to_db_row(candidate: SourceCandidate, user_id: str, report_id: str) -> dict:
    return {
        "user_id": user_id,
        "report_id": report_id,
        "ticker": candidate.ticker.upper() if candidate.ticker else None,
        "scope_type": candidate.scope_type,
        "scope_priority": candidate.scope_priority,
        "source_type": candidate.source_type,
        "title": candidate.title[:500],
        "snippet": (candidate.snippet or "")[:3000] or None,
        "url": candidate.url,
        "source_name": candidate.source_name,
        "published_at": candidate.published_at.isoformat() if candidate.published_at else None,
        "relevance_score": candidate.relevance_score,
        "importance": candidate.importance,
        "used_in_prompt": candidate.used_in_prompt,
        "dedupe_key": candidate.dedupe_key,
        "raw_payload": candidate.raw_payload,
    }


def prompt_item_dict(candidate: SourceCandidate) -> dict[str, Any]:
    return {
        "ticker": candidate.ticker,
        "scope_type": candidate.scope_type,
        "priority": candidate.scope_priority,
        "source_type": candidate.source_type,
        "title": candidate.title,
        "snippet": candidate.snippet,
        "url": candidate.url,
        "source_name": candidate.source_name,
        "published_at": candidate.published_at.isoformat() if candidate.published_at else None,
        "importance": candidate.importance,
        "score": candidate.relevance_score,
        "metadata": candidate.raw_payload,
    }


def json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)
