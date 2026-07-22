from __future__ import annotations

from collections import Counter
from typing import Any

from app.core.supabase import supabase
from app.services.market import market_service
from app.services.portfolio import portfolio_service
from app.services.watchlist import watchlist_service

DEFAULT_SETTINGS = {
    "enabled": False,
    "include_market_context": True,
}


class DailyNewsSettingsService:
    async def get_settings(self, user_id: str) -> dict:
        response = supabase.table("daily_news_briefing_settings") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        if response.data:
            return response.data[0]

        created = supabase.table("daily_news_briefing_settings") \
            .insert({"user_id": user_id, **DEFAULT_SETTINGS}) \
            .execute()
        return created.data[0]

    async def update_settings(self, user_id: str, data: dict) -> dict:
        payload = {
            "user_id": user_id,
            "enabled": bool(data.get("enabled", False)),
            "include_market_context": bool(data.get("include_market_context", True)),
        }
        response = supabase.table("daily_news_briefing_settings") \
            .upsert(payload, on_conflict="user_id") \
            .execute()
        return response.data[0]

    async def get_scope_items(self, user_id: str) -> list[dict]:
        response = supabase.table("daily_news_briefing_scope_items") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("priority") \
            .execute()
        return response.data or []

    async def get_scope_options(self, user_id: str) -> dict:
        portfolios = await portfolio_service.get_user_portfolios(user_id)
        watchlists = await watchlist_service.get_user_watchlists(user_id)
        selected = await self.get_scope_items(user_id)

        return {
            "portfolios": [
                {
                    "id": row["id"],
                    "source_type": "portfolio",
                    "name": row.get("name") or "",
                    "description": row.get("description"),
                    "item_count": 0,
                }
                for row in portfolios
            ],
            "watchlists": [
                {
                    "id": row["id"],
                    "source_type": "watchlist",
                    "name": row.get("name") or "",
                    "description": row.get("description"),
                    "item_count": int(row.get("item_count") or 0),
                }
                for row in watchlists
            ],
            "selected_items": selected,
        }

    async def replace_scope_items(self, user_id: str, items: list[dict]) -> list[dict]:
        rows = []
        for item in items:
            source_type = item["source_type"]
            source_id = item["source_id"]
            if source_type == "portfolio":
                if not await portfolio_service.verify_portfolio_ownership(source_id, user_id):
                    raise ValueError("Portfolio nenalezeno")
            elif source_type == "watchlist":
                if not await watchlist_service.verify_watchlist_ownership(source_id, user_id):
                    raise ValueError("Watchlist nenalezen")
            else:
                raise ValueError("Neplatný typ zdroje")

            rows.append({
                "user_id": user_id,
                "source_type": source_type,
                "source_id": source_id,
                "enabled": bool(item.get("enabled", True)),
                "priority": item.get("priority") or "medium",
            })

        supabase.table("daily_news_briefing_scope_items") \
            .delete() \
            .eq("user_id", user_id) \
            .execute()

        if rows:
            supabase.table("daily_news_briefing_scope_items").insert(rows).execute()
        return await self.get_scope_items(user_id)

    async def resolve_scope(self, user_id: str) -> dict[str, Any]:
        settings = await self.get_settings(user_id)
        items = [item for item in await self.get_scope_items(user_id) if item.get("enabled")]
        portfolios_by_id = {row["id"]: row for row in await portfolio_service.get_user_portfolios(user_id)}
        watchlists_by_id = {row["id"]: row for row in await watchlist_service.get_user_watchlists(user_id)}

        holdings: list[dict[str, Any]] = []
        watchlist_items: list[dict[str, Any]] = []
        selected_sources: list[dict[str, Any]] = []

        for item in items:
            priority = item.get("priority") or "medium"
            if item["source_type"] == "portfolio":
                portfolio = portfolios_by_id.get(item["source_id"])
                if not portfolio:
                    continue
                selected_sources.append({
                    "source_type": "portfolio",
                    "source_id": portfolio["id"],
                    "name": portfolio.get("name") or "",
                    "priority": priority,
                })
                for holding in await portfolio_service.get_holdings(portfolio["id"]):
                    stock = holding.get("stocks") or {}
                    ticker = stock.get("ticker")
                    if not ticker:
                        continue
                    holdings.append({
                        "ticker": ticker.upper(),
                        "name": stock.get("name"),
                        "sector": stock.get("sector"),
                        "industry": stock.get("industry"),
                        "portfolio_id": portfolio["id"],
                        "portfolio_name": portfolio.get("name"),
                        "priority": priority,
                    })
            elif item["source_type"] == "watchlist":
                watchlist = watchlists_by_id.get(item["source_id"])
                if not watchlist:
                    continue
                selected_sources.append({
                    "source_type": "watchlist",
                    "source_id": watchlist["id"],
                    "name": watchlist.get("name") or "",
                    "priority": priority,
                })
                for watch_item in await watchlist_service.get_watchlist_items(watchlist["id"]):
                    stock = watch_item.get("stocks") or {}
                    ticker = stock.get("ticker")
                    if not ticker:
                        continue
                    watchlist_items.append({
                        "ticker": ticker.upper(),
                        "name": stock.get("name"),
                        "sector": stock.get("sector"),
                        "industry": stock.get("industry"),
                        "watchlist_id": watchlist["id"],
                        "watchlist_name": watchlist.get("name"),
                        "target_buy_price": _coerce_float(watch_item.get("target_buy_price")),
                        "target_sell_price": _coerce_float(watch_item.get("target_sell_price")),
                        "notes": watch_item.get("notes"),
                        "priority": priority,
                    })

        sectors = sorted(
            sector
            for sector, _count in Counter(
                item.get("sector")
                for item in [*holdings, *watchlist_items]
                if item.get("sector")
            ).most_common(8)
        )

        tickers = sorted({item["ticker"] for item in [*holdings, *watchlist_items]})

        quotes = await market_service.get_quotes(tickers, include_extended=False) if tickers else {}
        for item in [*holdings, *watchlist_items]:
            quote = quotes.get(item["ticker"]) or {}
            item["current_price"] = _coerce_float(quote.get("price"))
            item["daily_change_percent"] = _coerce_float(quote.get("changePercent"))

        return {
            "settings": {
                "enabled": bool(settings.get("enabled")),
                "include_market_context": bool(settings.get("include_market_context", True)),
            },
            "selected_sources": selected_sources,
            "holdings": holdings,
            "watchlist_items": watchlist_items,
            "tickers": tickers,
            "sectors": sectors,
        }


def _coerce_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


daily_news_settings_service = DailyNewsSettingsService()
