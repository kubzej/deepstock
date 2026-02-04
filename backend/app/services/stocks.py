"""
Stocks service - global stock master data
"""
from app.core.supabase import supabase
from typing import List, Optional
from pydantic import BaseModel


class StockCreate(BaseModel):
    ticker: str
    name: str
    currency: str = "USD"
    sector: Optional[str] = None
    exchange: Optional[str] = None
    country: Optional[str] = None
    price_scale: float = 1.0
    notes: Optional[str] = None


class StockUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    sector: Optional[str] = None
    exchange: Optional[str] = None
    country: Optional[str] = None
    price_scale: Optional[float] = None
    notes: Optional[str] = None


class StockService:
    
    async def search(self, query: str, limit: int = 20) -> List[dict]:
        """
        Search stocks by ticker or name.
        Uses ilike for case-insensitive partial matching.
        """
        # Search by ticker first (exact match priority)
        ticker_response = supabase.table("stocks") \
            .select("*") \
            .ilike("ticker", f"{query.upper()}%") \
            .limit(limit) \
            .execute()
        
        # If we have enough results from ticker, return those
        if len(ticker_response.data) >= limit:
            return ticker_response.data
        
        # Otherwise also search by name
        remaining = limit - len(ticker_response.data)
        existing_ids = [s["id"] for s in ticker_response.data]
        
        name_response = supabase.table("stocks") \
            .select("*") \
            .ilike("name", f"%{query}%") \
            .limit(remaining + len(existing_ids)) \
            .execute()
        
        # Merge results, avoiding duplicates
        results = ticker_response.data.copy()
        for stock in name_response.data:
            if stock["id"] not in existing_ids:
                results.append(stock)
                if len(results) >= limit:
                    break
        
        return results
    
    async def get_all(self, limit: int = 100, offset: int = 0) -> List[dict]:
        """Get all stocks with pagination."""
        response = supabase.table("stocks") \
            .select("*") \
            .order("ticker") \
            .range(offset, offset + limit - 1) \
            .execute()
        return response.data
    
    async def get_by_ticker(self, ticker: str) -> Optional[dict]:
        """Get stock by ticker."""
        response = supabase.table("stocks") \
            .select("*") \
            .eq("ticker", ticker.upper()) \
            .execute()
        return response.data[0] if response.data else None
    
    async def get_by_id(self, stock_id: str) -> Optional[dict]:
        """Get stock by ID."""
        response = supabase.table("stocks") \
            .select("*") \
            .eq("id", stock_id) \
            .execute()
        return response.data[0] if response.data else None
    
    async def create(self, data: StockCreate) -> dict:
        """Create a new stock."""
        # Check if ticker already exists
        existing = await self.get_by_ticker(data.ticker)
        if existing:
            raise ValueError(f"Stock with ticker {data.ticker} already exists")
        
        response = supabase.table("stocks") \
            .insert({
                "ticker": data.ticker.upper(),
                "name": data.name,
                "currency": data.currency,
                "sector": data.sector,
                "exchange": data.exchange,
                "country": data.country,
                "price_scale": data.price_scale,
                "notes": data.notes,
            }) \
            .execute()
        return response.data[0]
    
    async def update(self, stock_id: str, data: StockUpdate) -> Optional[dict]:
        """Update stock details."""
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.currency is not None:
            update_data["currency"] = data.currency
        if data.sector is not None:
            update_data["sector"] = data.sector
        if data.exchange is not None:
            update_data["exchange"] = data.exchange
        if data.country is not None:
            update_data["country"] = data.country
        if data.price_scale is not None:
            update_data["price_scale"] = data.price_scale
        if data.notes is not None:
            update_data["notes"] = data.notes
        
        if not update_data:
            return await self.get_by_id(stock_id)
        
        response = supabase.table("stocks") \
            .update(update_data) \
            .eq("id", stock_id) \
            .execute()
        
        return response.data[0] if response.data else None
    
    async def delete(self, stock_id: str) -> bool:
        """
        Delete a stock. Will fail if stock has holdings/transactions.
        """
        try:
            supabase.table("stocks") \
                .delete() \
                .eq("id", stock_id) \
                .execute()
            return True
        except Exception:
            return False
    
    async def get_or_create(self, ticker: str, name: Optional[str] = None) -> dict:
        """Get stock by ticker or create if not exists."""
        existing = await self.get_by_ticker(ticker)
        if existing:
            return existing
        
        response = supabase.table("stocks") \
            .insert({
                "ticker": ticker.upper(),
                "name": name or ticker.upper(),
            }) \
            .execute()
        return response.data[0]


stock_service = StockService()
