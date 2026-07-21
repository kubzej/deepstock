from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from app.ai.prompts.daily_news_prompt import SYSTEM_PROMPT, build_daily_news_prompt
from app.ai.providers.litellm_client import call_llm
from app.core.supabase import supabase
from app.services.daily_news_edgar import EdgarError, EdgarUnsupportedTicker, edgar_client
from app.services.daily_news_marketaux import MarketauxError, marketaux_client
from app.services.daily_news_scoring import (
    SourceCandidate,
    bounded_raw_payload,
    candidate_to_db_row,
    prompt_item_dict,
    score_candidates,
)
from app.services.daily_news_settings import daily_news_settings_service
from app.services.push import get_notification_settings, send_push_notification
from app.services.research_context import research_context_service

logger = logging.getLogger(__name__)

STALE_RUNNING_AFTER = timedelta(hours=2)
PRAGUE_TZ = ZoneInfo("Europe/Prague")


class DailyNewsService:
    async def list_reports(self, user_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
        response = supabase.table("daily_news_reports") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()
        return response.data or []

    async def get_report(self, report_id: str, user_id: str) -> Optional[dict]:
        response = supabase.table("daily_news_reports") \
            .select("*") \
            .eq("id", report_id) \
            .eq("user_id", user_id) \
            .execute()
        return response.data[0] if response.data else None

    async def get_latest_report(self, user_id: str) -> Optional[dict]:
        response = supabase.table("daily_news_reports") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        return response.data[0] if response.data else None

    async def get_sources(
        self,
        report_id: str,
        user_id: str,
        *,
        ticker: Optional[str] = None,
        importance: Optional[str] = None,
    ) -> list[dict]:
        report = await self.get_report(report_id, user_id)
        if not report:
            raise ValueError("Report not found")

        query = supabase.table("daily_news_source_items") \
            .select("*") \
            .eq("report_id", report_id) \
            .eq("user_id", user_id) \
            .order("relevance_score", desc=True)
        if ticker:
            query = query.eq("ticker", ticker.upper())
        if importance:
            query = query.eq("importance", importance)
        response = query.execute()
        return response.data or []

    async def cleanup_stale_running_reports(self, user_id: Optional[str] = None) -> int:
        cutoff = datetime.now(timezone.utc) - STALE_RUNNING_AFTER
        query = supabase.table("daily_news_reports") \
            .select("id, user_id") \
            .eq("status", "running") \
            .lt("started_at", cutoff.isoformat())
        if user_id:
            query = query.eq("user_id", user_id)
        response = query.execute()
        rows = response.data or []
        for row in rows:
            supabase.table("daily_news_reports") \
                .update({
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "error": "Report generation timed out or web process restarted.",
                    "warnings": ["stale_running_recovered"],
                }) \
                .eq("id", row["id"]) \
                .eq("user_id", row["user_id"]) \
                .execute()
        return len(rows)

    async def start_manual_report(self, user_id: str, force: bool = False) -> dict:
        await self.cleanup_stale_running_reports(user_id)
        window_end = datetime.now(timezone.utc)
        window_start = window_end - timedelta(hours=24)
        report = await self._create_report(
            user_id=user_id,
            trigger_type="manual",
            window_start=window_start,
            window_end=window_end,
            force=force,
        )
        return report

    async def run_for_user(
        self,
        user_id: str,
        *,
        trigger_type: str,
        force: bool = False,
        report_id: Optional[str] = None,
    ) -> dict:
        await self.cleanup_stale_running_reports(user_id)
        if report_id:
            report = await self.get_report(report_id, user_id)
            if not report:
                raise ValueError("Report not found")
            window_start = _parse_dt(report["window_start"])
            window_end = _parse_dt(report["window_end"])
        else:
            window_end = datetime.now(timezone.utc)
            window_start = window_end - timedelta(hours=24)
            report = await self._create_report(
                user_id=user_id,
                trigger_type=trigger_type,
                window_start=window_start,
                window_end=window_end,
                force=force,
            )

        logger.info("Daily news report %s started for user %s", report["id"], user_id)
        warnings: list[str] = []
        candidates: list[SourceCandidate] = []
        source_counts: dict[str, Any] = {}

        try:
            scope_snapshot = await daily_news_settings_service.resolve_scope(user_id)
            supabase.table("daily_news_reports") \
                .update({"scope_snapshot": scope_snapshot}) \
                .eq("id", report["id"]) \
                .eq("user_id", user_id) \
                .execute()

            if scope_snapshot["settings"].get("include_market_context"):
                try:
                    market_context = await research_context_service.get_market_context(user_id)
                    candidates.append(SourceCandidate(
                        title="DeepStock market context snapshot",
                        snippet="Internal DeepStock market context included for daily briefing.",
                        source_type="deepstock_market",
                        scope_type="market",
                        scope_priority="low",
                        source_name="DeepStock",
                        published_at=window_end,
                        raw_payload=bounded_raw_payload(market_context),
                    ))
                    source_counts["deepstock_market"] = 1
                except Exception as exc:
                    logger.warning("Daily news market context failed: %s", exc, exc_info=True)
                    warnings.append("DeepStock market context se nepodařilo načíst.")

            await self._collect_marketaux(scope_snapshot, window_start, window_end, candidates, warnings, source_counts)
            await self._collect_edgar(scope_snapshot, window_start, window_end, candidates, warnings, source_counts)

            scored = score_candidates(candidates, window_end)
            rows = [candidate_to_db_row(candidate, user_id, report["id"]) for candidate in scored]
            if rows:
                supabase.table("daily_news_source_items").insert(rows).execute()
            source_counts["persisted"] = len(rows)
            source_counts["used_in_prompt"] = len([row for row in rows if row["used_in_prompt"]])

            prompt_items = [prompt_item_dict(candidate) for candidate in scored if candidate.used_in_prompt]
            user_prompt = build_daily_news_prompt(
                scope_snapshot=scope_snapshot,
                source_items=prompt_items,
                warnings=warnings,
                window_start=window_start.isoformat(),
                window_end=window_end.isoformat(),
            )

            content, model_used = await call_llm(SYSTEM_PROMPT, user_prompt)
            title = _extract_title(content) or "Denní briefing"
            summary = _extract_summary(content)
            status = "degraded" if warnings else "succeeded"
            notification_status = await self._send_notification_if_enabled(
                user_id,
                report["id"],
                title,
                _build_notification_body(content, summary),
            )

            updated = supabase.table("daily_news_reports") \
                .update({
                    "status": status,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "title": title,
                    "summary": summary,
                    "markdown": content,
                    "model_used": model_used,
                    "source_counts": source_counts,
                    "warnings": warnings,
                    "notification_status": notification_status,
                }) \
                .eq("id", report["id"]) \
                .eq("user_id", user_id) \
                .execute()
            logger.info(
                "Daily news report %s finished: status=%s candidates=%d prompt_items=%d",
                report["id"],
                status,
                len(candidates),
                len(prompt_items),
            )
            return updated.data[0]
        except Exception as exc:
            logger.error("Daily news report %s failed: %s", report["id"], exc, exc_info=True)
            updated = supabase.table("daily_news_reports") \
                .update({
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "source_counts": source_counts,
                    "warnings": warnings,
                    "error": str(exc)[:2000],
                }) \
                .eq("id", report["id"]) \
                .eq("user_id", user_id) \
                .execute()
            return updated.data[0]

    async def run_enabled_users(self) -> dict[str, Any]:
        await self.cleanup_stale_running_reports()
        response = supabase.table("daily_news_briefing_settings") \
            .select("user_id") \
            .eq("enabled", True) \
            .execute()
        user_ids = [row["user_id"] for row in response.data or []]
        result = {
            "users_checked": len(user_ids),
            "reports_generated": 0,
            "succeeded": 0,
            "degraded": 0,
            "failed": 0,
            "notifications_sent": 0,
        }
        for user_id in user_ids:
            report = await self.run_for_user(user_id, trigger_type="scheduled")
            result["reports_generated"] += 1
            result[report["status"]] = result.get(report["status"], 0) + 1
            if str(report.get("notification_status") or "").startswith("sent:"):
                result["notifications_sent"] += 1
        return result

    async def _create_report(
        self,
        *,
        user_id: str,
        trigger_type: str,
        window_start: datetime,
        window_end: datetime,
        force: bool,
    ) -> dict:
        running = supabase.table("daily_news_reports") \
            .select("id") \
            .eq("user_id", user_id) \
            .eq("status", "running") \
            .execute()
        if running.data and not force:
            raise ValueError("Denní briefing se už generuje.")

        if not force:
            local_day_start, local_day_end = _local_day_bounds_utc(window_end)
            existing = supabase.table("daily_news_reports") \
                .select("*") \
                .eq("user_id", user_id) \
                .in_("status", ["succeeded", "degraded"]) \
                .gte("window_end", local_day_start.isoformat()) \
                .lt("window_end", local_day_end.isoformat()) \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()
            if existing.data:
                return existing.data[0]

        created = supabase.table("daily_news_reports") \
            .insert({
                "user_id": user_id,
                "status": "running",
                "trigger_type": trigger_type,
                "window_start": window_start.isoformat(),
                "window_end": window_end.isoformat(),
                "started_at": datetime.now(timezone.utc).isoformat(),
                "warnings": [],
                "source_counts": {},
            }) \
            .execute()
        return created.data[0]

    async def _collect_marketaux(
        self,
        scope_snapshot: dict,
        window_start: datetime,
        window_end: datetime,
        candidates: list[SourceCandidate],
        warnings: list[str],
        source_counts: dict[str, Any],
    ) -> None:
        fetched = 0
        try:
            scope_entries = [
                *[
                    {
                        "ticker": item["ticker"],
                        "scope_type": "holding",
                        "priority": item.get("priority") or "high",
                    }
                    for item in scope_snapshot.get("holdings", [])
                ],
                *[
                    {
                        "ticker": item["ticker"],
                        "scope_type": "watchlist",
                        "priority": item.get("priority") or "medium",
                    }
                    for item in scope_snapshot.get("watchlist_items", [])
                ],
            ]
            unique_entries = []
            seen_tickers: set[str] = set()
            for entry in scope_entries:
                ticker = entry["ticker"].upper()
                if ticker in seen_tickers:
                    continue
                seen_tickers.add(ticker)
                unique_entries.append({**entry, "ticker": ticker})

            batch_size = max(1, marketaux_client.settings.marketaux_symbols_per_request)
            for batch in _chunks(unique_entries[:80], batch_size):
                candidates.extend(await marketaux_client.fetch_for_tickers(
                    batch,
                    window_start=window_start,
                    window_end=window_end,
                ))
                fetched += 1

            for query in ["Federal Reserve rates", "US stock market macro"]:
                candidates.extend(await marketaux_client.fetch_for_query(
                    query,
                    scope_type="macro",
                    window_start=window_start,
                    window_end=window_end,
                    limit=3,
                ))
                fetched += 1

            for sector in scope_snapshot.get("sectors", [])[:8]:
                candidates.extend(await marketaux_client.fetch_for_query(
                    f"{sector} sector stocks",
                    scope_type="sector",
                    window_start=window_start,
                    window_end=window_end,
                    limit=3,
                ))
                fetched += 1
        except MarketauxError as exc:
            logger.warning("Marketaux collection failed: %s", exc)
            warnings.append(f"Marketaux provider gap: {exc}")
        source_counts["marketaux_requests"] = fetched

    async def _collect_edgar(
        self,
        scope_snapshot: dict,
        window_start: datetime,
        window_end: datetime,
        candidates: list[SourceCandidate],
        warnings: list[str],
        source_counts: dict[str, Any],
    ) -> None:
        fetched = 0
        skipped = 0
        ticker_meta: dict[str, dict[str, str]] = {}
        for scope_type, items in (
            ("holding", scope_snapshot.get("holdings", [])),
            ("watchlist", scope_snapshot.get("watchlist_items", [])),
        ):
            for item in items:
                ticker = item.get("ticker")
                if ticker:
                    ticker_meta.setdefault(ticker, {
                        "priority": item.get("priority") or "medium",
                        "scope_type": scope_type,
                    })
        for ticker, meta in ticker_meta.items():
            try:
                candidates.extend(await edgar_client.fetch_recent_filings(
                    ticker,
                    priority=meta["priority"],
                    scope_type=meta["scope_type"],
                    window_start=window_start,
                    window_end=window_end,
                ))
                fetched += 1
            except EdgarUnsupportedTicker:
                skipped += 1
            except EdgarError as exc:
                logger.warning("EDGAR collection failed for %s: %s", ticker, exc)
                warnings.append(f"EDGAR provider gap pro {ticker}: {exc}")
        source_counts["edgar_tickers_checked"] = fetched
        source_counts["edgar_tickers_skipped"] = skipped

    async def _send_notification_if_enabled(self, user_id: str, report_id: str, title: str, body: str) -> str:
        try:
            settings = get_notification_settings(user_id)
            if not settings.get("notifications_enabled") or not settings.get("alert_daily_news_enabled"):
                return "disabled"
            sent = send_push_notification(
                user_id=user_id,
                title="Denní briefing",
                body=body or "Nový briefing je připravený.",
                url=f"/daily-briefing/{report_id}",
                tag="daily-news-briefing",
            )
            return f"sent:{sent}"
        except Exception as exc:
            logger.warning("Daily news push failed: %s", exc, exc_info=True)
            return f"failed:{str(exc)[:200]}"


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _local_day_bounds_utc(value: datetime) -> tuple[datetime, datetime]:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    local_value = value.astimezone(PRAGUE_TZ)
    local_start = local_value.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def _chunks(items: list[dict[str, str]], size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def _extract_title(markdown: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return ""


def _extract_summary(markdown: str) -> str:
    lines = []
    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        cleaned = _clean_summary_line(stripped.lstrip("- ").strip())
        if not cleaned or cleaned.lower().startswith("okno:"):
            continue
        lines.append(cleaned)
        if len(" ".join(lines)) > 220:
            break
    return " ".join(lines)[:320]


def _build_notification_body(markdown: str, summary: str = "") -> str:
    candidates = []
    for line in markdown.splitlines():
        cleaned = _clean_summary_line(line.strip().lstrip("-• ").strip())
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in {"denní briefing", "rychlý verdikt"}:
            continue
        if lowered.startswith("okno:"):
            continue
        candidates.append(cleaned)

    body = candidates[0] if candidates else _clean_summary_line(summary)
    return _truncate_notification_body(body)


def _truncate_notification_body(value: str, limit: int = 110) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= limit:
        return value

    cut = value[:limit].rstrip()
    sentence_end = max(cut.rfind("."), cut.rfind(";"))
    if sentence_end >= 60:
        return cut[:sentence_end + 1]

    word_end = cut.rfind(" ")
    if word_end >= 60:
        cut = cut[:word_end]
    return cut.rstrip(" ,;:-") + "..."


def _clean_summary_line(value: str) -> str:
    value = re.sub(r"\*\*(.*?)\*\*", r"\1", value)
    value = value.replace("`", "")
    value = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", value)
    value = re.sub(r"^#+\s*", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


daily_news_service = DailyNewsService()
