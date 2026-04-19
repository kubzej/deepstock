"""
Watchlist-focused helpers for the MCP research context surface.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.supabase import supabase
from app.services.stocks import stock_service
from app.services.watchlist import watchlist_service


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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


def _serialize_watchlist_summary(watchlist: dict) -> dict:
    return {
        "id": watchlist.get("id"),
        "name": watchlist.get("name") or "",
        "description": watchlist.get("description"),
        "position": int(watchlist.get("position") or 0),
        "item_count": int(watchlist.get("item_count") or 0),
    }


def _serialize_watchlist_detail_item(item: dict) -> dict:
    stock = item.get("stocks") or {}
    return {
        "id": item.get("id"),
        "ticker": stock.get("ticker") or "",
        "stock_name": stock.get("name"),
        "target_buy_price": _coerce_float(item.get("target_buy_price")),
        "target_sell_price": _coerce_float(item.get("target_sell_price")),
        "notes": item.get("notes"),
        "sector": item.get("sector"),
        "added_at": item.get("added_at"),
    }


class WatchlistContextService:
    async def build_watchlist_context(self, ticker: str, user_id: str) -> dict:
        stock = await stock_service.get_by_ticker(ticker)
        if not stock:
            return {"count": 0, "items": []}

        watchlist_rows = supabase.table("watchlists") \
            .select("id, name") \
            .eq("user_id", user_id) \
            .execute()
        watchlist_names = {row["id"]: row["name"] for row in (watchlist_rows.data or [])}
        if not watchlist_names:
            return {"count": 0, "items": []}

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
        return {"count": len(items), "items": items}

    async def list_watchlists(self, user_id: str) -> dict:
        watchlists = await watchlist_service.get_user_watchlists(user_id)
        watchlist_summaries = [_serialize_watchlist_summary(watchlist) for watchlist in watchlists]
        return {
            "generated_at": _iso_now(),
            "watchlist_count": len(watchlist_summaries),
            "watchlists": watchlist_summaries,
        }

    async def get_watchlist_items(self, watchlist_id: str, user_id: str) -> dict:
        watchlist = await watchlist_service.get_watchlist(watchlist_id, user_id)
        if not watchlist:
            raise ValueError("Watchlist not found")

        items_raw = await watchlist_service.get_watchlist_items(watchlist_id)
        items = [_serialize_watchlist_detail_item(item) for item in items_raw]
        return {
            "watchlist_id": watchlist["id"],
            "watchlist_name": watchlist.get("name") or "",
            "description": watchlist.get("description"),
            "generated_at": _iso_now(),
            "items": items,
        }


watchlist_context_service = WatchlistContextService()
