from app.core.supabase import supabase
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal


class PortfolioCreate(BaseModel):
    name: str
    currency: str = "USD"
    description: Optional[str] = None


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    description: Optional[str] = None


class TransactionCreate(BaseModel):
    stock_ticker: str
    stock_name: Optional[str] = None
    type: str  # BUY or SELL
    shares: float
    price_per_share: float
    currency: str = "USD"
    fees: float = 0
    notes: Optional[str] = None
    executed_at: datetime


class PortfolioService:
    
    async def get_user_portfolios(self, user_id: str) -> List[dict]:
        """Get all portfolios for a user."""
        response = supabase.table("portfolios") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        return response.data
    
    async def create_portfolio(self, user_id: str, data: PortfolioCreate) -> dict:
        """Create a new portfolio."""
        response = supabase.table("portfolios") \
            .insert({
                "user_id": user_id,
                "name": data.name,
                "currency": data.currency,
                "description": data.description
            }) \
            .execute()
        return response.data[0]
    
    async def update_portfolio(self, portfolio_id: str, user_id: str, data: 'PortfolioUpdate') -> dict:
        """Update a portfolio. Verifies ownership."""
        # Build update dict with only provided fields
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.currency is not None:
            update_data["currency"] = data.currency
        if data.description is not None:
            update_data["description"] = data.description
        
        if not update_data:
            # Nothing to update, return existing
            response = supabase.table("portfolios") \
                .select("*") \
                .eq("id", portfolio_id) \
                .eq("user_id", user_id) \
                .execute()
            return response.data[0] if response.data else None
        
        response = supabase.table("portfolios") \
            .update(update_data) \
            .eq("id", portfolio_id) \
            .eq("user_id", user_id) \
            .execute()
        
        return response.data[0] if response.data else None
    
    async def delete_portfolio(self, portfolio_id: str, user_id: str) -> bool:
        """Delete a portfolio and all related data. Verifies ownership."""
        # First verify ownership
        check = supabase.table("portfolios") \
            .select("id") \
            .eq("id", portfolio_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not check.data:
            return False
        
        # Delete portfolio (cascade should handle holdings/transactions)
        supabase.table("portfolios") \
            .delete() \
            .eq("id", portfolio_id) \
            .execute()
        
        return True
    
    async def get_holdings(self, portfolio_id: str) -> List[dict]:
        """Get all holdings for a portfolio with stock info."""
        response = supabase.table("holdings") \
            .select("*, stocks(ticker, name, currency)") \
            .eq("portfolio_id", portfolio_id) \
            .gt("shares", 0) \
            .execute()
        return response.data
    
    async def get_transactions(self, portfolio_id: str, limit: int = 50) -> List[dict]:
        """Get recent transactions for a portfolio."""
        response = supabase.table("transactions") \
            .select("*, stocks(ticker, name)") \
            .eq("portfolio_id", portfolio_id) \
            .order("executed_at", desc=True) \
            .limit(limit) \
            .execute()
        return response.data
    
    async def add_transaction(self, portfolio_id: str, data: TransactionCreate) -> dict:
        """
        Add a transaction and update holdings.
        This is the core logic for portfolio management.
        """
        # 1. Ensure stock exists in master table
        stock = await self._get_or_create_stock(data.stock_ticker, data.stock_name)
        
        # 2. Create transaction record
        total_amount = data.shares * data.price_per_share
        tx_response = supabase.table("transactions") \
            .insert({
                "portfolio_id": portfolio_id,
                "stock_id": stock["id"],
                "type": data.type.upper(),
                "shares": data.shares,
                "price_per_share": data.price_per_share,
                "total_amount": total_amount,
                "currency": data.currency,
                "fees": data.fees,
                "notes": data.notes,
                "executed_at": data.executed_at.isoformat()
            }) \
            .execute()
        
        # 3. Update holdings (recalculate position)
        await self._recalculate_holding(portfolio_id, stock["id"])
        
        return tx_response.data[0]
    
    async def _get_or_create_stock(self, ticker: str, name: Optional[str] = None) -> dict:
        """Get stock from master table or create if not exists."""
        response = supabase.table("stocks") \
            .select("*") \
            .eq("ticker", ticker.upper()) \
            .execute()
        
        if response.data:
            return response.data[0]
        
        # Create new stock entry
        create_response = supabase.table("stocks") \
            .insert({
                "ticker": ticker.upper(),
                "name": name or ticker.upper()
            }) \
            .execute()
        return create_response.data[0]
    
    async def _recalculate_holding(self, portfolio_id: str, stock_id: str):
        """
        Recalculate holding based on all transactions.
        Uses FIFO for cost basis.
        """
        # Get all transactions for this stock in this portfolio
        response = supabase.table("transactions") \
            .select("*") \
            .eq("portfolio_id", portfolio_id) \
            .eq("stock_id", stock_id) \
            .order("executed_at", desc=False) \
            .execute()
        
        transactions = response.data
        
        # Calculate position using FIFO
        shares = 0
        total_cost = 0
        realized_pnl = 0
        buy_lots = []  # List of (shares, price) tuples
        
        for tx in transactions:
            if tx["type"] == "BUY":
                shares += float(tx["shares"])
                buy_lots.append({
                    "shares": float(tx["shares"]),
                    "price": float(tx["price_per_share"])
                })
                total_cost += float(tx["total_amount"])
            elif tx["type"] == "SELL":
                sell_shares = float(tx["shares"])
                sell_price = float(tx["price_per_share"])
                shares -= sell_shares
                
                # FIFO: sell from oldest lots first
                shares_to_sell = sell_shares
                cost_of_sold = 0
                
                while shares_to_sell > 0 and buy_lots:
                    lot = buy_lots[0]
                    if lot["shares"] <= shares_to_sell:
                        # Use entire lot
                        cost_of_sold += lot["shares"] * lot["price"]
                        shares_to_sell -= lot["shares"]
                        buy_lots.pop(0)
                    else:
                        # Partial lot
                        cost_of_sold += shares_to_sell * lot["price"]
                        lot["shares"] -= shares_to_sell
                        shares_to_sell = 0
                
                realized_pnl += (sell_shares * sell_price) - cost_of_sold
                total_cost -= cost_of_sold
        
        avg_cost = total_cost / shares if shares > 0 else 0
        
        # Upsert holding
        supabase.table("holdings") \
            .upsert({
                "portfolio_id": portfolio_id,
                "stock_id": stock_id,
                "shares": shares,
                "avg_cost_per_share": round(avg_cost, 4),
                "total_cost": round(total_cost, 4),
                "realized_pnl": round(realized_pnl, 4),
                "updated_at": datetime.utcnow().isoformat()
            }, on_conflict="portfolio_id,stock_id") \
            .execute()


portfolio_service = PortfolioService()
