"""
Journal Service - channels, sections, and entries for the personal journal
"""
import logging
from typing import List, Optional
from pydantic import BaseModel
from app.core.supabase import supabase

logger = logging.getLogger(__name__)


# ============================================
# Pydantic schemas
# ============================================

class SectionCreate(BaseModel):
    name: str
    color: str = "#6b7280"
    sort_order: int = 0


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class ChannelCreate(BaseModel):
    name: str
    section_id: Optional[str] = None
    sort_order: int = 0


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    section_id: Optional[str] = None
    sort_order: Optional[int] = None


class EntryCreate(BaseModel):
    channel_id: str
    type: str  # note | ai_report | ext_ref
    content: str
    metadata: dict = {}


class EntryUpdate(BaseModel):
    content: str


# ============================================
# JournalService
# ============================================

class JournalService:

    # ------------------------------------------
    # Sections
    # ------------------------------------------

    async def get_sections(self) -> List[dict]:
        response = supabase.table("journal_sections") \
            .select("*") \
            .order("sort_order") \
            .execute()
        return response.data

    async def create_section(self, data: SectionCreate) -> dict:
        response = supabase.table("journal_sections") \
            .insert({
                "name": data.name,
                "color": data.color,
                "sort_order": data.sort_order,
            }) \
            .execute()
        return response.data[0]

    async def update_section(self, section_id: str, data: SectionUpdate) -> Optional[dict]:
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            response = supabase.table("journal_sections").select("*").eq("id", section_id).execute()
            return response.data[0] if response.data else None
        response = supabase.table("journal_sections") \
            .update(update_data) \
            .eq("id", section_id) \
            .execute()
        return response.data[0] if response.data else None

    async def delete_section(self, section_id: str) -> bool:
        # Move channels in this section to no section (SET NULL via FK)
        supabase.table("journal_channels") \
            .update({"section_id": None}) \
            .eq("section_id", section_id) \
            .execute()
        supabase.table("journal_sections").delete().eq("id", section_id).execute()
        return True

    # ------------------------------------------
    # Channels
    # ------------------------------------------

    async def get_channels(self) -> List[dict]:
        """All channels with entry count and stock name for stock channels."""
        response = supabase.table("journal_channels") \
            .select("*, entry_count:journal_entries(count), stock:stocks(name)") \
            .order("type") \
            .order("name") \
            .execute()

        channels = []
        for ch in response.data:
            count = ch.pop("entry_count", None)
            ch["entry_count"] = count[0]["count"] if count else 0
            stock = ch.pop("stock", None)
            ch["stock_name"] = stock["name"] if stock else None
            channels.append(ch)
        return channels

    async def get_or_create_stock_channel(self, stock_id: str, ticker: str) -> dict:
        """Called when a stock is created. Idempotent."""
        existing = supabase.table("journal_channels") \
            .select("*") \
            .eq("stock_id", stock_id) \
            .execute()
        if existing.data:
            return existing.data[0]

        response = supabase.table("journal_channels") \
            .insert({
                "type": "stock",
                "name": ticker.upper(),
                "stock_id": stock_id,
                "ticker": ticker.upper(),
                "sort_order": 0,
            }) \
            .execute()
        return response.data[0]

    async def create_custom_channel(self, data: ChannelCreate) -> dict:
        response = supabase.table("journal_channels") \
            .insert({
                "type": "custom",
                "name": data.name,
                "section_id": data.section_id,
                "sort_order": data.sort_order,
            }) \
            .execute()
        return response.data[0]

    async def update_channel(self, channel_id: str, data: ChannelUpdate) -> Optional[dict]:
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            response = supabase.table("journal_channels").select("*").eq("id", channel_id).execute()
            return response.data[0] if response.data else None
        response = supabase.table("journal_channels") \
            .update(update_data) \
            .eq("id", channel_id) \
            .execute()
        return response.data[0] if response.data else None

    async def delete_custom_channel(self, channel_id: str) -> bool:
        """Only custom channels can be deleted directly. Stock channels are deleted via CASCADE."""
        existing = supabase.table("journal_channels") \
            .select("type") \
            .eq("id", channel_id) \
            .execute()
        if not existing.data or existing.data[0]["type"] != "custom":
            return False
        supabase.table("journal_channels").delete().eq("id", channel_id).execute()
        return True

    async def get_channel_by_ticker(self, ticker: str) -> Optional[dict]:
        response = supabase.table("journal_channels") \
            .select("*") \
            .eq("ticker", ticker.upper()) \
            .execute()
        return response.data[0] if response.data else None

    # ------------------------------------------
    # Entries
    # ------------------------------------------

    async def get_entries(
        self,
        channel_id: Optional[str] = None,
        ticker: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> List[dict]:
        """
        Fetch entries for a channel or ticker (infinite scroll via cursor).
        cursor = ISO timestamp — return entries older than this created_at.
        """
        if ticker and not channel_id:
            channel = await self.get_channel_by_ticker(ticker)
            if not channel:
                return []
            channel_id = channel["id"]

        if not channel_id:
            return []

        query = supabase.table("journal_entries") \
            .select("*") \
            .eq("channel_id", channel_id) \
            .order("created_at", desc=True) \
            .limit(limit)

        if cursor:
            query = query.lt("created_at", cursor)

        response = query.execute()
        return response.data

    async def create_entry(
        self,
        data: EntryCreate,
        redis=None,
    ) -> dict:
        """
        Create a journal entry.
        For notes on stock channels, auto-fetches current price into metadata.
        """
        metadata = dict(data.metadata)

        if data.type == "note" and redis is not None:
            channel = supabase.table("journal_channels") \
                .select("type, ticker") \
                .eq("id", data.channel_id) \
                .execute()
            if channel.data and channel.data[0]["type"] == "stock":
                ticker = channel.data[0]["ticker"]
                try:
                    from app.services.market.quotes import get_quotes
                    quotes = await get_quotes(redis, [ticker])
                    if ticker in quotes:
                        metadata["price_at_creation"] = quotes[ticker].get("price")
                except Exception as e:
                    logger.warning(f"Could not fetch price for journal note ({ticker}): {e}")

        response = supabase.table("journal_entries") \
            .insert({
                "channel_id": data.channel_id,
                "type": data.type,
                "content": data.content,
                "metadata": metadata,
            }) \
            .execute()
        return response.data[0]

    async def update_entry(self, entry_id: str, data: EntryUpdate) -> Optional[dict]:
        """Update only content — metadata and created_at are immutable."""
        response = supabase.table("journal_entries") \
            .update({"content": data.content}) \
            .eq("id", entry_id) \
            .execute()
        return response.data[0] if response.data else None

    async def delete_entry(self, entry_id: str) -> bool:
        supabase.table("journal_entries").delete().eq("id", entry_id).execute()
        return True


journal_service = JournalService()
