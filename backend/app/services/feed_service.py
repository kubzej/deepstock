"""
Feed service — CRUD for feed_lists and feed_list_accounts.
"""
import logging
from typing import Optional

from app.core.supabase import supabase

logger = logging.getLogger(__name__)


class FeedService:

    async def get_lists(self, user_id: str) -> list[dict]:
        resp = (
            supabase.table("feed_lists")
            .select("*, feed_list_accounts(username)")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return resp.data or []

    async def get_list(self, list_id: str, user_id: str) -> Optional[dict]:
        resp = (
            supabase.table("feed_lists")
            .select("*, feed_list_accounts(username)")
            .eq("id", list_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return resp.data

    async def create_list(self, user_id: str, name: str, description: Optional[str] = None) -> dict:
        resp = (
            supabase.table("feed_lists")
            .insert({"user_id": user_id, "name": name, "description": description, "source": "x"})
            .execute()
        )
        return resp.data[0]

    async def update_list(self, list_id: str, user_id: str, name: str, description: Optional[str] = None) -> dict:
        resp = (
            supabase.table("feed_lists")
            .update({"name": name, "description": description})
            .eq("id", list_id)
            .eq("user_id", user_id)
            .execute()
        )
        return resp.data[0]

    async def delete_list(self, list_id: str, user_id: str) -> None:
        supabase.table("feed_lists").delete().eq("id", list_id).eq("user_id", user_id).execute()

    async def add_account(self, list_id: str, username: str) -> dict:
        username = username.lstrip("@").strip().lower()
        resp = (
            supabase.table("feed_list_accounts")
            .insert({"list_id": list_id, "username": username})
            .execute()
        )
        return resp.data[0]

    async def remove_account(self, list_id: str, username: str) -> None:
        username = username.lstrip("@").strip().lower()
        supabase.table("feed_list_accounts").delete().eq("list_id", list_id).eq("username", username).execute()

    async def get_usernames(self, list_id: str) -> list[str]:
        resp = (
            supabase.table("feed_list_accounts")
            .select("username")
            .eq("list_id", list_id)
            .execute()
        )
        return [r["username"] for r in (resp.data or [])]


feed_service = FeedService()
