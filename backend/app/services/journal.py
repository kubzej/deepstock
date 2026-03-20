"""
Journal Service - channels, sections, and entries for the personal journal
"""
import logging
import re
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel
from app.core.supabase import supabase
from app.core.config import get_settings

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

        if data.type in ("note", "ext_ref") and redis is not None:
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
        # Fetch entry first to clean up storage images
        entry = supabase.table("journal_entries").select("content").eq("id", entry_id).execute()
        if entry.data:
            self._delete_storage_images(entry.data[0].get("content", ""))
        supabase.table("journal_entries").delete().eq("id", entry_id).execute()
        return True

    def _delete_storage_images(self, html: str) -> None:
        """Remove Supabase Storage images referenced in entry HTML."""
        if not html:
            return
        settings = get_settings()
        # Match src="..." from img tags pointing to our Supabase storage
        storage_prefix = f"{settings.supabase_url}/storage/v1/object/public/journal/"
        paths = []
        for src in re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html):
            if src.startswith(storage_prefix):
                path = src[len(storage_prefix):]
                paths.append(path)
        if paths:
            try:
                supabase.storage.from_("journal").remove(paths)
            except Exception as e:
                logger.warning(f"Failed to delete storage images: {e}")


    # ------------------------------------------
    # Transaction / Option journal entries
    # ------------------------------------------

    async def create_transaction_journal_entry(
        self,
        ticker: str,
        transaction_id: str,
        portfolio_id: str,
        action: str,
        shares: float,
        price: float,
        currency: str,
        fees: float,
        notes: Optional[str],
        executed_at: datetime,
    ) -> None:
        """Create a journal entry for a stock transaction. Fire-and-forget safe."""
        try:
            channel = await self.get_channel_by_ticker(ticker)
            if not channel:
                return
            supabase.table("journal_entries").insert({
                "channel_id": channel["id"],
                "type": "transaction",
                "content": notes or "",
                "metadata": {
                    "action": action,
                    "shares": shares,
                    "price": price,
                    "currency": currency,
                    "fees": fees,
                    "ticker": ticker.upper(),
                    "portfolio_id": portfolio_id,
                },
                "linked_transaction_id": transaction_id,
                "created_at": executed_at.isoformat(),
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to create transaction journal entry ({ticker} {transaction_id}): {e}")

    async def update_transaction_journal_entry(
        self,
        transaction_id: str,
        notes: Optional[str],
        shares: float,
        price: float,
        currency: str,
        fees: float,
    ) -> None:
        """Update journal entry linked to a stock transaction."""
        try:
            existing = supabase.table("journal_entries") \
                .select("id, metadata") \
                .eq("linked_transaction_id", transaction_id) \
                .execute()
            if not existing.data:
                return
            entry = existing.data[0]
            new_metadata = {
                **entry["metadata"],
                "shares": shares,
                "price": price,
                "currency": currency,
                "fees": fees,
            }
            supabase.table("journal_entries") \
                .update({"content": notes or "", "metadata": new_metadata}) \
                .eq("id", entry["id"]) \
                .execute()
        except Exception as e:
            logger.warning(f"Failed to update transaction journal entry ({transaction_id}): {e}")

    async def create_option_journal_entry(
        self,
        ticker: str,
        option_transaction_id: str,
        portfolio_id: str,
        action: str,
        option_type: str,
        strike: float,
        expiration: date,
        contracts: int,
        premium: Optional[float],
        option_symbol: str,
        notes: Optional[str],
        created_at: datetime,
    ) -> None:
        """Create a journal entry for an option transaction. Fire-and-forget safe."""
        try:
            channel = await self.get_channel_by_ticker(ticker)
            if not channel:
                return
            supabase.table("journal_entries").insert({
                "channel_id": channel["id"],
                "type": "option_trade",
                "content": notes or "",
                "metadata": {
                    "action": action,
                    "option_type": option_type,
                    "strike": strike,
                    "expiration": expiration.isoformat() if hasattr(expiration, "isoformat") else str(expiration),
                    "contracts": contracts,
                    "premium": premium,
                    "option_symbol": option_symbol,
                    "ticker": ticker.upper(),
                    "portfolio_id": portfolio_id,
                },
                "linked_option_transaction_id": option_transaction_id,
                "created_at": created_at.isoformat(),
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to create option journal entry ({ticker} {option_transaction_id}): {e}")

    async def update_option_journal_entry(
        self,
        option_transaction_id: str,
        notes: Optional[str],
        action: str,
        contracts: int,
        premium: Optional[float],
    ) -> None:
        """Update journal entry linked to an option transaction."""
        try:
            existing = supabase.table("journal_entries") \
                .select("id, metadata") \
                .eq("linked_option_transaction_id", option_transaction_id) \
                .execute()
            if not existing.data:
                return
            entry = existing.data[0]
            new_metadata = {
                **entry["metadata"],
                "action": action,
                "contracts": contracts,
                "premium": premium,
            }
            supabase.table("journal_entries") \
                .update({"content": notes or "", "metadata": new_metadata}) \
                .eq("id", entry["id"]) \
                .execute()
        except Exception as e:
            logger.warning(f"Failed to update option journal entry ({option_transaction_id}): {e}")


journal_service = JournalService()
