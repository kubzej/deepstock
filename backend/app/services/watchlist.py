"""
Watchlist service - CRUD operations for watchlists and items
"""
from app.core.supabase import supabase
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


# ============================================
# Pydantic Models
# ============================================

class WatchlistCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WatchlistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class WatchlistItemCreate(BaseModel):
    stock_id: Optional[str] = None  # If provided, use this
    ticker: Optional[str] = None     # If stock_id not provided, lookup/create by ticker
    stock_name: Optional[str] = None # For auto-creating stock
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notes: Optional[str] = None
    sector: Optional[str] = None


class WatchlistItemUpdate(BaseModel):
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notes: Optional[str] = None
    sector: Optional[str] = None


class TagCreate(BaseModel):
    name: str


class TagUpdate(BaseModel):
    name: Optional[str] = None


# ============================================
# Watchlist Service
# ============================================

class WatchlistService:
    
    # ==========================================
    # WATCHLISTS
    # ==========================================
    
    async def get_user_watchlists(self, user_id: str) -> List[dict]:
        """Get all watchlists for a user with item counts."""
        response = supabase.table("watchlist_summary") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("position") \
            .execute()
        return response.data
    
    async def get_watchlist(self, watchlist_id: str, user_id: str) -> Optional[dict]:
        """Get a single watchlist by ID."""
        response = supabase.table("watchlists") \
            .select("*") \
            .eq("id", watchlist_id) \
            .eq("user_id", user_id) \
            .execute()
        return response.data[0] if response.data else None
    
    async def create_watchlist(self, user_id: str, data: WatchlistCreate) -> dict:
        """Create a new watchlist."""
        response = supabase.table("watchlists") \
            .insert({
                "user_id": user_id,
                "name": data.name.strip(),
                "description": data.description
            }) \
            .execute()
        return response.data[0]
    
    async def update_watchlist(self, watchlist_id: str, user_id: str, data: WatchlistUpdate) -> Optional[dict]:
        """Update a watchlist."""
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name.strip()
        if data.description is not None:
            update_data["description"] = data.description
        
        if not update_data:
            return await self.get_watchlist(watchlist_id, user_id)
        
        response = supabase.table("watchlists") \
            .update(update_data) \
            .eq("id", watchlist_id) \
            .eq("user_id", user_id) \
            .execute()
        
        return response.data[0] if response.data else None
    
    async def delete_watchlist(self, watchlist_id: str, user_id: str) -> bool:
        """Delete a watchlist (cascade deletes items)."""
        # Verify ownership first
        check = supabase.table("watchlists") \
            .select("id") \
            .eq("id", watchlist_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not check.data:
            return False
        
        supabase.table("watchlists") \
            .delete() \
            .eq("id", watchlist_id) \
            .execute()
        
        return True
    
    async def reorder_watchlists(self, user_id: str, watchlist_ids: List[str]) -> bool:
        """Reorder watchlists by updating their positions."""
        for index, watchlist_id in enumerate(watchlist_ids):
            supabase.table("watchlists") \
                .update({"position": index}) \
                .eq("id", watchlist_id) \
                .eq("user_id", user_id) \
                .execute()
        return True
    
    # ==========================================
    # WATCHLIST ITEMS
    # ==========================================
    
    async def get_watchlist_items(self, watchlist_id: str) -> List[dict]:
        """Get all items in a watchlist with stock info."""
        response = supabase.table("watchlist_items") \
            .select("*, stocks(id, ticker, name, currency, sector, price_scale)") \
            .eq("watchlist_id", watchlist_id) \
            .order("added_at", desc=True) \
            .execute()
        return response.data
    
    async def get_item(self, item_id: str) -> Optional[dict]:
        """Get a single item by ID."""
        response = supabase.table("watchlist_items") \
            .select("*, stocks(id, ticker, name, currency, sector, price_scale)") \
            .eq("id", item_id) \
            .execute()
        return response.data[0] if response.data else None
    
    async def add_item(self, watchlist_id: str, data: WatchlistItemCreate) -> dict:
        """Add an item to a watchlist."""
        stock_id = data.stock_id
        
        # If no stock_id but ticker provided, lookup or create stock
        if not stock_id and data.ticker:
            stock = await self._get_or_create_stock(
                ticker=data.ticker.upper(),
                name=data.stock_name
            )
            stock_id = stock["id"]
        
        if not stock_id:
            raise ValueError("Either stock_id or ticker must be provided")
        
        # Check if already exists in this watchlist
        existing = supabase.table("watchlist_items") \
            .select("id") \
            .eq("watchlist_id", watchlist_id) \
            .eq("stock_id", stock_id) \
            .execute()
        
        if existing.data:
            raise ValueError("Tato akcie už je v tomto watchlistu")
        
        response = supabase.table("watchlist_items") \
            .insert({
                "watchlist_id": watchlist_id,
                "stock_id": stock_id,
                "target_buy_price": data.target_buy_price,
                "target_sell_price": data.target_sell_price,
                "notes": data.notes,
                "sector": data.sector
            }) \
            .execute()
        
        # Return with stock info
        return await self.get_item(response.data[0]["id"])
    
    async def update_item(self, item_id: str, data: WatchlistItemUpdate) -> Optional[dict]:
        """Update a watchlist item."""
        update_data = {}
        
        # Handle explicit None (clear value) vs not provided
        if data.target_buy_price is not None:
            update_data["target_buy_price"] = data.target_buy_price
        if data.target_sell_price is not None:
            update_data["target_sell_price"] = data.target_sell_price
        if data.notes is not None:
            update_data["notes"] = data.notes
        if data.sector is not None:
            update_data["sector"] = data.sector
        
        if not update_data:
            return await self.get_item(item_id)
        
        response = supabase.table("watchlist_items") \
            .update(update_data) \
            .eq("id", item_id) \
            .execute()
        
        if not response.data:
            return None
        
        return await self.get_item(item_id)
    
    async def delete_item(self, item_id: str) -> bool:
        """Remove an item from a watchlist."""
        response = supabase.table("watchlist_items") \
            .delete() \
            .eq("id", item_id) \
            .execute()
        return len(response.data) > 0
    
    async def move_item(self, item_id: str, target_watchlist_id: str) -> Optional[dict]:
        """Move an item to another watchlist."""
        # Get current item
        item = await self.get_item(item_id)
        if not item:
            return None
        
        stock_id = item["stock_id"]
        
        # Check if already exists in target
        existing = supabase.table("watchlist_items") \
            .select("id") \
            .eq("watchlist_id", target_watchlist_id) \
            .eq("stock_id", stock_id) \
            .execute()
        
        if existing.data:
            raise ValueError("Tato akcie už je v cílovém watchlistu")
        
        # Update watchlist_id
        response = supabase.table("watchlist_items") \
            .update({"watchlist_id": target_watchlist_id}) \
            .eq("id", item_id) \
            .execute()
        
        if not response.data:
            return None
        
        # Also move tags
        # Tags stay with item (item_id doesn't change), so no action needed
        
        return await self.get_item(item_id)
    
    async def _get_or_create_stock(self, ticker: str, name: Optional[str] = None) -> dict:
        """Get existing stock or create new one."""
        # Try to find existing
        response = supabase.table("stocks") \
            .select("*") \
            .eq("ticker", ticker) \
            .execute()
        
        if response.data:
            return response.data[0]
        
        # Create new stock
        create_response = supabase.table("stocks") \
            .insert({
                "ticker": ticker,
                "name": name or ticker,
                "currency": "USD"  # Default, can be updated later
            }) \
            .execute()
        
        return create_response.data[0]
    
    # ==========================================
    # TAGS
    # ==========================================
    
    async def get_user_tags(self, user_id: str) -> List[dict]:
        """Get all tags for a user."""
        response = supabase.table("watchlist_tags") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("name") \
            .execute()
        return response.data
    
    async def create_tag(self, user_id: str, data: TagCreate) -> dict:
        """Create a new tag."""
        response = supabase.table("watchlist_tags") \
            .insert({
                "user_id": user_id,
                "name": data.name.strip()
            }) \
            .execute()
        return response.data[0]
    
    async def update_tag(self, tag_id: str, user_id: str, data: TagUpdate) -> Optional[dict]:
        """Update a tag."""
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name.strip()
        
        if not update_data:
            response = supabase.table("watchlist_tags") \
                .select("*") \
                .eq("id", tag_id) \
                .eq("user_id", user_id) \
                .execute()
            return response.data[0] if response.data else None
        
        response = supabase.table("watchlist_tags") \
            .update(update_data) \
            .eq("id", tag_id) \
            .eq("user_id", user_id) \
            .execute()
        
        return response.data[0] if response.data else None
    
    async def delete_tag(self, tag_id: str, user_id: str) -> bool:
        """Delete a tag (cascade removes from items)."""
        response = supabase.table("watchlist_tags") \
            .delete() \
            .eq("id", tag_id) \
            .eq("user_id", user_id) \
            .execute()
        return len(response.data) > 0
    
    # ==========================================
    # ITEM TAGS (assignments)
    # ==========================================
    
    async def get_item_tags(self, item_id: str) -> List[dict]:
        """Get all tags for an item."""
        response = supabase.table("watchlist_item_tags") \
            .select("*, watchlist_tags(*)") \
            .eq("item_id", item_id) \
            .execute()
        # Extract just the tag objects
        return [row["watchlist_tags"] for row in response.data if row.get("watchlist_tags")]
    
    async def add_tag_to_item(self, item_id: str, tag_id: str) -> bool:
        """Add a tag to an item."""
        try:
            supabase.table("watchlist_item_tags") \
                .insert({
                    "item_id": item_id,
                    "tag_id": tag_id
                }) \
                .execute()
            return True
        except Exception:
            # Already exists or invalid
            return False
    
    async def remove_tag_from_item(self, item_id: str, tag_id: str) -> bool:
        """Remove a tag from an item."""
        response = supabase.table("watchlist_item_tags") \
            .delete() \
            .eq("item_id", item_id) \
            .eq("tag_id", tag_id) \
            .execute()
        return len(response.data) > 0
    
    async def set_item_tags(self, item_id: str, tag_ids: List[str]) -> List[dict]:
        """Replace all tags on an item with new set."""
        # Delete all existing
        supabase.table("watchlist_item_tags") \
            .delete() \
            .eq("item_id", item_id) \
            .execute()
        
        # Add new ones
        if tag_ids:
            supabase.table("watchlist_item_tags") \
                .insert([{"item_id": item_id, "tag_id": tid} for tid in tag_ids]) \
                .execute()
        
        return await self.get_item_tags(item_id)


# Singleton instance
watchlist_service = WatchlistService()
