"""
Journal-focused helpers for the MCP research context surface.
"""
from __future__ import annotations

import html
import re
from datetime import datetime, timezone

from app.core.redis import get_redis
from app.core.supabase import supabase
from app.services.journal import EntryCreate, journal_service


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _preview_text(content: str, max_chars: int = 280) -> str:
    preview = (content or "").strip()
    if len(preview) > max_chars:
        return preview[:max_chars].rstrip() + "..."
    return preview


def _plain_text_note_to_html(content: str) -> str:
    normalized = content.replace("\r\n", "\n").strip()
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", normalized) if part.strip()]
    if not paragraphs:
        return "<p></p>"
    return "".join(
        f"<p>{html.escape(paragraph).replace(chr(10), '<br>')}</p>"
        for paragraph in paragraphs
    )


def _html_to_plain_text(content: str) -> str:
    normalized = (content or "").replace("\r\n", "\n")
    normalized = re.sub(r"<br\s*/?>", "\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"</p\s*>", "\n\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<[^>]+>", " ", normalized)
    normalized = html.unescape(normalized)
    normalized = re.sub(r"[ \t]+\n", "\n", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    normalized = re.sub(r"[ \t]{2,}", " ", normalized)
    return normalized.strip()


def _serialize_note_preview(entry: dict) -> dict:
    content = _html_to_plain_text(entry.get("content") or "")
    content = re.sub(r"\s+", " ", content).strip()
    return {
        "id": entry.get("id"),
        "created_at": entry.get("created_at"),
        "updated_at": entry.get("updated_at"),
        "type": entry.get("type") or "note",
        "preview": _preview_text(content),
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
    return {
        **base,
        "preview": _preview_text(content, max_chars=400),
        "content_length": len(content),
    }


class JournalContextService:
    async def build_journal_context(
        self,
        ticker: str,
        user_id: str,
        notes_preview_limit: int = 5,
        report_preview_limit: int = 3,
    ) -> dict:
        channel = await journal_service.get_channel_by_ticker(ticker, user_id=user_id)
        if not channel:
            return {
                "note_count": 0,
                "report_count": 0,
                "latest_note_at": None,
                "latest_report_at": None,
                "has_more_notes": False,
                "has_more_reports": False,
                "notes": [],
                "reports": [],
            }

        entries = await journal_service.get_entries(
            channel_id=channel["id"],
            limit=100,
            user_id=user_id,
        )
        note_entries = [entry for entry in entries if entry.get("type") == "note"]
        ai_report_entries = [entry for entry in entries if entry.get("type") == "ai_report"]

        return {
            "note_count": len(note_entries),
            "report_count": len(ai_report_entries),
            "latest_note_at": note_entries[0].get("created_at") if note_entries else None,
            "latest_report_at": ai_report_entries[0].get("created_at") if ai_report_entries else None,
            "has_more_notes": len(note_entries) > notes_preview_limit,
            "has_more_reports": len(ai_report_entries) > report_preview_limit,
            "notes": [_serialize_note_preview(entry) for entry in note_entries[:notes_preview_limit]],
            "reports": [
                _serialize_ai_report(entry, include_full_content=False)
                for entry in ai_report_entries[:report_preview_limit]
            ],
        }

    async def get_stock_journal_archive(self, ticker: str, user_id: str, limit: int = 10) -> dict:
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
            _serialize_note_preview(entry)
            for entry in entries
            if entry.get("type") == "note"
        ][:limit]

        return {
            "ticker": normalized_ticker,
            "generated_at": _iso_now(),
            "reports": reports,
            "notes": notes,
        }

    async def get_portfolio_journal_archive(self, portfolio_id: str, user_id: str, limit: int = 10) -> dict:
        portfolio = supabase.table("portfolios") \
            .select("id, name") \
            .eq("id", portfolio_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        portfolio_row = portfolio.data
        if not portfolio_row:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        channel = await journal_service.get_channel_by_portfolio_id(portfolio_id, user_id=user_id)
        if not channel:
            return {
                "portfolio_id": portfolio_row["id"],
                "portfolio_name": portfolio_row["name"],
                "generated_at": _iso_now(),
                "reports": [],
                "notes": [],
            }

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
            _serialize_note_preview(entry)
            for entry in entries
            if entry.get("type") == "note"
        ][:limit]

        return {
            "portfolio_id": portfolio_row["id"],
            "portfolio_name": portfolio_row["name"],
            "generated_at": _iso_now(),
            "reports": reports,
            "notes": notes,
        }

    async def get_journal_report_content(self, report_id: str, user_id: str) -> dict:
        entry = supabase.table("journal_entries") \
            .select("id, created_at, content, metadata, type, journal_channels!inner(user_id)") \
            .eq("id", report_id) \
            .eq("journal_channels.user_id", user_id) \
            .single() \
            .execute()
        row = entry.data
        if not row:
            raise ValueError(f"Report {report_id} not found")
        if row.get("type") != "ai_report":
            raise ValueError(f"Entry {report_id} is not an AI report")
        metadata = row.get("metadata") or {}
        return {
            "id": row.get("id"),
            "created_at": row.get("created_at"),
            "report_type": metadata.get("report_type"),
            "model": metadata.get("model"),
            "content": row.get("content") or "",
            "content_format": "markdown",
        }

    async def get_journal_note_content(self, note_id: str, user_id: str) -> dict:
        entry = supabase.table("journal_entries") \
            .select("id, created_at, updated_at, content, metadata, type, journal_channels!inner(user_id)") \
            .eq("id", note_id) \
            .eq("journal_channels.user_id", user_id) \
            .single() \
            .execute()
        row = entry.data
        if not row:
            raise ValueError(f"Note {note_id} not found")
        if row.get("type") != "note":
            raise ValueError(f"Entry {note_id} is not a note")
        return {
            "id": row.get("id"),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "type": row.get("type") or "note",
            "content": _html_to_plain_text(row.get("content") or ""),
            "content_format": "plain_text",
            "metadata": row.get("metadata") or {},
        }

    async def save_stock_journal_note(self, ticker: str, content: str, user_id: str) -> dict:
        normalized_ticker = ticker.upper()
        channel = await journal_service.get_channel_by_ticker(normalized_ticker, user_id=user_id)
        if not channel:
            raise ValueError(f"Stock journal channel for {normalized_ticker} not found")

        entry = await journal_service.create_entry(
            EntryCreate(
                channel_id=channel["id"],
                type="note",
                content=_plain_text_note_to_html(content),
                metadata={
                    "ticker": normalized_ticker,
                    "source": "mcp_stock_note",
                },
            ),
            redis=get_redis(),
        )
        return {
            "entry_id": entry.get("id"),
            "ticker": normalized_ticker,
            "channel_id": channel["id"],
            "created_at": entry.get("created_at"),
            "content": content,
            "content_format": "plain_text",
            "metadata": entry.get("metadata") or {},
        }

    async def save_portfolio_journal_note(self, portfolio_id: str, content: str, user_id: str) -> dict:
        portfolio = supabase.table("portfolios") \
            .select("id, name") \
            .eq("id", portfolio_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        portfolio_row = portfolio.data
        if not portfolio_row:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        channel = await journal_service.get_channel_by_portfolio_id(portfolio_id, user_id=user_id)
        if not channel:
            raise ValueError(f"Portfolio journal channel for {portfolio_id} not found")

        entry = await journal_service.create_entry(
            EntryCreate(
                channel_id=channel["id"],
                type="note",
                content=_plain_text_note_to_html(content),
                metadata={
                    "portfolio_id": portfolio_id,
                    "portfolio_name": portfolio_row["name"],
                    "source": "mcp_portfolio_note",
                },
            ),
            redis=get_redis(),
        )
        return {
            "entry_id": entry.get("id"),
            "portfolio_id": portfolio_id,
            "portfolio_name": portfolio_row["name"],
            "channel_id": channel["id"],
            "created_at": entry.get("created_at"),
            "content": content,
            "content_format": "plain_text",
            "metadata": entry.get("metadata") or {},
        }


journal_context_service = JournalContextService()
