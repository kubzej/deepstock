from app.core.supabase import supabase
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal


class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class TransactionCreate(BaseModel):
    stock_ticker: str
    stock_name: Optional[str] = None
    type: str  # BUY or SELL
    shares: float
    price_per_share: float
    currency: str = "USD"
    exchange_rate_to_czk: Optional[float] = None
    fees: float = 0
    notes: Optional[str] = None
    executed_at: datetime
    source_transaction_id: Optional[str] = None  # For SELL: which lot to sell from


class AvailableLot(BaseModel):
    """A BUY lot with remaining shares available for selling."""
    id: str
    date: str
    quantity: float  # Original quantity
    remaining_shares: float  # Shares not yet sold
    price_per_share: float
    currency: str
    total_amount: float


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
            .select("*, stocks(ticker, name, currency, sector, price_scale)") \
            .eq("portfolio_id", portfolio_id) \
            .gt("shares", 0) \
            .execute()
        return response.data
    
    async def recalculate_all_holdings(self, portfolio_id: str) -> dict:
        """Recalculate all holdings for a portfolio to populate total_invested_czk."""
        # Get all unique stock_ids from holdings
        holdings = supabase.table("holdings") \
            .select("stock_id") \
            .eq("portfolio_id", portfolio_id) \
            .execute()
        
        count = 0
        for h in holdings.data:
            await self._recalculate_holding(portfolio_id, h["stock_id"])
            count += 1
        
        return {"recalculated": count}
    
    async def recalculate_all_portfolios(self) -> dict:
        """Recalculate all holdings across ALL portfolios."""
        # Get all portfolios
        portfolios = supabase.table("portfolios") \
            .select("id") \
            .execute()
        
        total = 0
        for p in portfolios.data:
            result = await self.recalculate_all_holdings(p["id"])
            total += result["recalculated"]
        
        return {"portfolios": len(portfolios.data), "holdings_recalculated": total}
    
    async def get_all_holdings(self, user_id: str) -> List[dict]:
        """Get all holdings across all user's portfolios with portfolio info."""
        # First get user's portfolio IDs
        portfolios = await self.get_user_portfolios(user_id)
        if not portfolios:
            return []
        
        portfolio_ids = [p["id"] for p in portfolios]
        portfolio_names = {p["id"]: p["name"] for p in portfolios}
        
        # Get holdings for all portfolios
        response = supabase.table("holdings") \
            .select("*, stocks(ticker, name, currency, sector, price_scale), portfolios(name)") \
            .in_("portfolio_id", portfolio_ids) \
            .gt("shares", 0) \
            .execute()
        
        # Add portfolio_name to each holding
        for h in response.data:
            h["portfolio_name"] = portfolio_names.get(h["portfolio_id"], "")
        
        return response.data
    
    async def get_all_transactions(self, user_id: str, limit: int = 100) -> List[dict]:
        """Get transactions across all user's portfolios."""
        # First get user's portfolio IDs
        portfolios = await self.get_user_portfolios(user_id)
        if not portfolios:
            return []
        
        portfolio_ids = [p["id"] for p in portfolios]
        portfolio_names = {p["id"]: p["name"] for p in portfolios}
        
        # Get transactions with portfolio info
        response = supabase.table("transactions") \
            .select("*, stocks(ticker, name), source_transaction:source_transaction_id(id, executed_at, price_per_share, currency, shares), portfolios(name)") \
            .in_("portfolio_id", portfolio_ids) \
            .order("executed_at", desc=True) \
            .limit(limit) \
            .execute()
        
        # Add portfolio_name to each transaction
        for tx in response.data:
            tx["portfolio_name"] = portfolio_names.get(tx["portfolio_id"], "")
        
        return response.data
    
    async def get_all_open_lots_for_user(self, user_id: str) -> List[dict]:
        """
        Get all open lots across ALL user's portfolios.
        Returns BUY transactions with remaining shares, enriched with stock info and portfolio name.
        """
        # Get user's portfolios
        portfolios = await self.get_user_portfolios(user_id)
        if not portfolios:
            return []
        
        portfolio_ids = [p["id"] for p in portfolios]
        portfolio_names = {p["id"]: p["name"] for p in portfolios}
        
        # Get all BUY transactions across all portfolios
        buy_response = supabase.table("transactions") \
            .select("*, stocks(ticker, name, currency, price_scale)") \
            .in_("portfolio_id", portfolio_ids) \
            .eq("type", "BUY") \
            .order("executed_at", desc=False) \
            .execute()
        
        buy_transactions = buy_response.data or []
        
        # Get all SELL transactions with source_transaction_id
        sell_response = supabase.table("transactions") \
            .select("source_transaction_id, shares") \
            .in_("portfolio_id", portfolio_ids) \
            .eq("type", "SELL") \
            .not_.is_("source_transaction_id", "null") \
            .execute()
        
        sell_transactions = sell_response.data or []
        
        # Calculate sold quantities per lot
        sold_per_lot: dict[str, float] = {}
        for sell in sell_transactions:
            if sell.get("source_transaction_id"):
                lot_id = sell["source_transaction_id"]
                sold_per_lot[lot_id] = sold_per_lot.get(lot_id, 0) + float(sell["shares"])
        
        # Handle FIFO sells per stock per portfolio
        fifo_sell_response = supabase.table("transactions") \
            .select("stock_id, portfolio_id, shares") \
            .in_("portfolio_id", portfolio_ids) \
            .eq("type", "SELL") \
            .is_("source_transaction_id", "null") \
            .execute()
        
        # Key: (stock_id, portfolio_id) -> sold amount
        fifo_sells_per_stock: dict[tuple, float] = {}
        for sell in (fifo_sell_response.data or []):
            key = (sell["stock_id"], sell["portfolio_id"])
            fifo_sells_per_stock[key] = fifo_sells_per_stock.get(key, 0) + float(sell["shares"])
        
        # Group buys by (stock_id, portfolio_id) for FIFO processing
        buys_by_key: dict[tuple, list] = {}
        for buy in buy_transactions:
            key = (buy["stock_id"], buy["portfolio_id"])
            if key not in buys_by_key:
                buys_by_key[key] = []
            buys_by_key[key].append(buy)
        
        # Apply FIFO sells to lots
        for key, fifo_sold in fifo_sells_per_stock.items():
            remaining_to_sell = fifo_sold
            for buy in buys_by_key.get(key, []):
                if remaining_to_sell <= 0:
                    break
                already_sold = sold_per_lot.get(buy["id"], 0)
                available = float(buy["shares"]) - already_sold
                if available > 0:
                    sell_from_this = min(available, remaining_to_sell)
                    sold_per_lot[buy["id"]] = already_sold + sell_from_this
                    remaining_to_sell -= sell_from_this
        
        # Build open lots with remaining shares
        open_lots = []
        for buy in buy_transactions:
            sold_from_lot = sold_per_lot.get(buy["id"], 0)
            remaining = float(buy["shares"]) - sold_from_lot
            
            if remaining > 0.0001:  # Small threshold for floating point
                stock_info = buy.get("stocks", {})
                price_scale_raw = stock_info.get("price_scale")
                price_scale = float(price_scale_raw) if price_scale_raw else 1.0
                open_lots.append({
                    "id": buy["id"],
                    "ticker": stock_info.get("ticker", ""),
                    "stockName": stock_info.get("name", ""),
                    "date": buy["executed_at"][:10] if buy["executed_at"] else "",
                    "shares": remaining,
                    "buyPrice": float(buy["price_per_share"]),
                    "currency": stock_info.get("currency") or buy.get("currency") or "USD",
                    "priceScale": price_scale,
                    "portfolioName": portfolio_names.get(buy["portfolio_id"], ""),
                })
        
        return open_lots

    async def get_transactions(self, portfolio_id: str, limit: int = 50, stock_id: str = None) -> List[dict]:
        """Get recent transactions for a portfolio, optionally filtered by stock."""
        # Include source_transaction for SELL transactions (to show lot info and P/L)
        query = supabase.table("transactions") \
            .select("*, stocks(ticker, name), source_transaction:source_transaction_id(id, executed_at, price_per_share, currency, shares)") \
            .eq("portfolio_id", portfolio_id) \
            .order("executed_at", desc=True) \
            .limit(limit)
        
        if stock_id:
            query = query.eq("stock_id", stock_id)
            
        response = query.execute()
        return response.data
    
    async def add_transaction(self, portfolio_id: str, data: TransactionCreate) -> dict:
        """
        Add a transaction and update holdings.
        This is the core logic for portfolio management.
        
        For SELL transactions:
        - If source_transaction_id is provided, sell from that specific lot
        - Otherwise, use FIFO (oldest lots first)
        """
        # 1. Ensure stock exists in master table
        stock = await self._get_or_create_stock(data.stock_ticker, data.stock_name)
        
        # 2. Create transaction record
        total_amount = data.shares * data.price_per_share
        tx_data = {
            "portfolio_id": portfolio_id,
            "stock_id": stock["id"],
            "type": data.type.upper(),
            "shares": data.shares,
            "price_per_share": data.price_per_share,
            "total_amount": total_amount,
            "currency": data.currency,
            "exchange_rate_to_czk": data.exchange_rate_to_czk,
            "fees": data.fees,
            "notes": data.notes,
            "executed_at": data.executed_at.isoformat(),
            "source_transaction_id": data.source_transaction_id,
        }
        
        tx_response = supabase.table("transactions") \
            .insert(tx_data) \
            .execute()
        
        # 3. Update holdings (recalculate position)
        await self._recalculate_holding(portfolio_id, stock["id"])
        
        return tx_response.data[0]
    
    async def get_all_open_lots(self, portfolio_id: str) -> List[dict]:
        """
        Get all open lots across all holdings in a portfolio.
        Returns BUY transactions with remaining shares, enriched with stock info.
        """
        # Get all BUY transactions for this portfolio
        buy_response = supabase.table("transactions") \
            .select("*, stocks(ticker, name, currency, price_scale)") \
            .eq("portfolio_id", portfolio_id) \
            .eq("type", "BUY") \
            .order("executed_at", desc=False) \
            .execute()
        
        buy_transactions = buy_response.data or []
        
        # Get all SELL transactions with source_transaction_id
        sell_response = supabase.table("transactions") \
            .select("source_transaction_id, shares") \
            .eq("portfolio_id", portfolio_id) \
            .eq("type", "SELL") \
            .not_.is_("source_transaction_id", "null") \
            .execute()
        
        sell_transactions = sell_response.data or []
        
        # Calculate sold quantities per lot
        sold_per_lot: dict[str, float] = {}
        for sell in sell_transactions:
            if sell.get("source_transaction_id"):
                lot_id = sell["source_transaction_id"]
                sold_per_lot[lot_id] = sold_per_lot.get(lot_id, 0) + float(sell["shares"])
        
        # Also handle FIFO sells (no source_transaction_id) per stock
        fifo_sell_response = supabase.table("transactions") \
            .select("stock_id, shares") \
            .eq("portfolio_id", portfolio_id) \
            .eq("type", "SELL") \
            .is_("source_transaction_id", "null") \
            .execute()
        
        fifo_sells_per_stock: dict[str, float] = {}
        for sell in (fifo_sell_response.data or []):
            stock_id = sell["stock_id"]
            fifo_sells_per_stock[stock_id] = fifo_sells_per_stock.get(stock_id, 0) + float(sell["shares"])
        
        # Group buys by stock_id for FIFO processing
        buys_by_stock: dict[str, list] = {}
        for buy in buy_transactions:
            stock_id = buy["stock_id"]
            if stock_id not in buys_by_stock:
                buys_by_stock[stock_id] = []
            buys_by_stock[stock_id].append(buy)
        
        # Apply FIFO sells to lots
        for stock_id, fifo_sold in fifo_sells_per_stock.items():
            remaining_to_sell = fifo_sold
            for buy in buys_by_stock.get(stock_id, []):
                if remaining_to_sell <= 0:
                    break
                already_sold = sold_per_lot.get(buy["id"], 0)
                available = float(buy["shares"]) - already_sold
                if available > 0:
                    sell_from_this = min(available, remaining_to_sell)
                    sold_per_lot[buy["id"]] = already_sold + sell_from_this
                    remaining_to_sell -= sell_from_this
        
        # Build open lots with remaining shares
        open_lots = []
        for buy in buy_transactions:
            sold_from_lot = sold_per_lot.get(buy["id"], 0)
            remaining = float(buy["shares"]) - sold_from_lot
            
            if remaining > 0.0001:  # Small threshold for floating point
                stock_info = buy.get("stocks", {})
                price_scale_raw = stock_info.get("price_scale")
                price_scale = float(price_scale_raw) if price_scale_raw else 1.0
                open_lots.append({
                    "id": buy["id"],
                    "ticker": stock_info.get("ticker", ""),
                    "stockName": stock_info.get("name", ""),
                    "date": buy["executed_at"][:10] if buy["executed_at"] else "",
                    "shares": remaining,
                    "buyPrice": float(buy["price_per_share"]),
                    "currency": stock_info.get("currency") or buy.get("currency") or "USD",
                    "priceScale": price_scale,
                })
        
        return open_lots

    async def get_available_lots(self, portfolio_id: str, stock_ticker: str) -> List[AvailableLot]:
        """
        Get available lots for selling a specific stock in a portfolio.
        Returns BUY transactions with remaining shares (not fully sold yet).
        """
        # First get stock_id from ticker
        stock_response = supabase.table("stocks") \
            .select("id") \
            .eq("ticker", stock_ticker.upper()) \
            .execute()
        
        if not stock_response.data:
            return []
        
        stock_id = stock_response.data[0]["id"]
        
        # Get all BUY transactions for this stock/portfolio
        buy_response = supabase.table("transactions") \
            .select("*") \
            .eq("stock_id", stock_id) \
            .eq("portfolio_id", portfolio_id) \
            .eq("type", "BUY") \
            .order("executed_at", desc=False) \
            .execute()
        
        buy_transactions = buy_response.data or []
        
        # Get all SELL transactions that reference specific lots
        sell_response = supabase.table("transactions") \
            .select("source_transaction_id, shares") \
            .eq("stock_id", stock_id) \
            .eq("portfolio_id", portfolio_id) \
            .eq("type", "SELL") \
            .not_.is_("source_transaction_id", "null") \
            .execute()
        
        sell_transactions = sell_response.data or []
        
        # Calculate sold quantities per lot
        sold_per_lot: dict[str, float] = {}
        for sell in sell_transactions:
            if sell.get("source_transaction_id"):
                lot_id = sell["source_transaction_id"]
                sold_per_lot[lot_id] = sold_per_lot.get(lot_id, 0) + float(sell["shares"])
        
        # Build available lots with remaining shares
        available_lots: List[AvailableLot] = []
        for buy in buy_transactions:
            sold_from_lot = sold_per_lot.get(buy["id"], 0)
            remaining = float(buy["shares"]) - sold_from_lot
            
            if remaining > 0:
                available_lots.append(AvailableLot(
                    id=buy["id"],
                    date=buy["executed_at"][:10] if buy["executed_at"] else "",
                    quantity=float(buy["shares"]),
                    remaining_shares=remaining,
                    price_per_share=float(buy["price_per_share"]),
                    currency=buy["currency"] or "USD",
                    total_amount=float(buy["total_amount"] or 0),
                ))
        
        return available_lots
    
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
        Uses FIFO for cost basis, unless source_transaction_id specifies a lot.
        Calculates total_invested_czk using historical exchange rates.
        """
        # Get all transactions for this stock in this portfolio
        response = supabase.table("transactions") \
            .select("*") \
            .eq("portfolio_id", portfolio_id) \
            .eq("stock_id", stock_id) \
            .order("executed_at", desc=False) \
            .execute()
        
        transactions = response.data
        
        # Calculate position - respects source_transaction_id if specified
        shares = 0
        total_cost = 0
        total_invested_czk = 0  # Sum of BUY amounts in CZK (historical rates)
        realized_pnl = 0
        # Track lots by transaction ID for specific lot selling
        buy_lots = []  # List of {id, shares, price, amount_czk_per_share} dicts
        
        for tx in transactions:
            if tx["type"] == "BUY":
                tx_shares = float(tx["shares"])
                tx_price = float(tx["price_per_share"])
                tx_amount = float(tx["total_amount"])
                tx_amount_czk = float(tx.get("total_amount_czk") or tx_amount)
                
                shares += tx_shares
                total_cost += tx_amount
                total_invested_czk += tx_amount_czk
                
                buy_lots.append({
                    "id": tx["id"],
                    "shares": tx_shares,
                    "price": tx_price,
                    "amount_czk_per_share": tx_amount_czk / tx_shares if tx_shares > 0 else 0
                })
            elif tx["type"] == "SELL":
                sell_shares = float(tx["shares"])
                sell_price = float(tx["price_per_share"])
                source_tx_id = tx.get("source_transaction_id")
                shares -= sell_shares
                
                shares_to_sell = sell_shares
                cost_of_sold = 0
                cost_of_sold_czk = 0
                
                if source_tx_id:
                    # Sell from specific lot
                    for lot in buy_lots:
                        if lot["id"] == source_tx_id:
                            sell_from_lot = min(lot["shares"], shares_to_sell)
                            cost_of_sold += sell_from_lot * lot["price"]
                            cost_of_sold_czk += sell_from_lot * lot["amount_czk_per_share"]
                            lot["shares"] -= sell_from_lot
                            shares_to_sell -= sell_from_lot
                            # Remove lot if empty
                            if lot["shares"] <= 0:
                                buy_lots.remove(lot)
                            break
                
                # FIFO for remaining shares (if source lot didn't cover all, or no source specified)
                while shares_to_sell > 0 and buy_lots:
                    lot = buy_lots[0]
                    if lot["shares"] <= shares_to_sell:
                        # Use entire lot
                        cost_of_sold += lot["shares"] * lot["price"]
                        cost_of_sold_czk += lot["shares"] * lot["amount_czk_per_share"]
                        shares_to_sell -= lot["shares"]
                        buy_lots.pop(0)
                    else:
                        # Partial lot
                        cost_of_sold += shares_to_sell * lot["price"]
                        cost_of_sold_czk += shares_to_sell * lot["amount_czk_per_share"]
                        lot["shares"] -= shares_to_sell
                        shares_to_sell = 0
                
                realized_pnl += (sell_shares * sell_price) - cost_of_sold
                total_cost -= cost_of_sold
                total_invested_czk -= cost_of_sold_czk
        
        avg_cost = total_cost / shares if shares > 0 else 0
        
        # Upsert holding
        supabase.table("holdings") \
            .upsert({
                "portfolio_id": portfolio_id,
                "stock_id": stock_id,
                "shares": shares,
                "avg_cost_per_share": round(avg_cost, 4),
                "total_cost": round(total_cost, 4),
                "total_invested_czk": round(total_invested_czk, 4),
                "realized_pnl": round(realized_pnl, 4),
                "updated_at": datetime.utcnow().isoformat()
            }, on_conflict="portfolio_id,stock_id") \
            .execute()

    async def update_transaction(self, portfolio_id: str, transaction_id: str, data: 'TransactionUpdate') -> Optional[dict]:
        """
        Update a transaction. Only allows updating certain fields.
        Recalculates holding after update.
        """
        # First get existing transaction to verify portfolio and get stock_id
        existing = supabase.table("transactions") \
            .select("*") \
            .eq("id", transaction_id) \
            .eq("portfolio_id", portfolio_id) \
            .execute()
        
        if not existing.data:
            return None
        
        tx = existing.data[0]
        stock_id = tx["stock_id"]
        
        # Build update dict
        update_data = {}
        if data.shares is not None:
            update_data["shares"] = data.shares
            update_data["total_amount"] = data.shares * (data.price_per_share if data.price_per_share is not None else tx["price_per_share"])
        if data.price_per_share is not None:
            update_data["price_per_share"] = data.price_per_share
            shares = data.shares if data.shares is not None else tx["shares"]
            update_data["total_amount"] = shares * data.price_per_share
        if data.currency is not None:
            update_data["currency"] = data.currency
        if data.exchange_rate_to_czk is not None:
            update_data["exchange_rate_to_czk"] = data.exchange_rate_to_czk
        if data.fees is not None:
            update_data["fees"] = data.fees
        if data.notes is not None:
            update_data["notes"] = data.notes
        if data.executed_at is not None:
            update_data["executed_at"] = data.executed_at.isoformat()
        
        if not update_data:
            return tx
        
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        response = supabase.table("transactions") \
            .update(update_data) \
            .eq("id", transaction_id) \
            .execute()
        
        # Recalculate holding
        await self._recalculate_holding(portfolio_id, stock_id)
        
        return response.data[0] if response.data else None

    async def delete_transaction(self, portfolio_id: str, transaction_id: str) -> bool:
        """
        Delete a transaction. Recalculates holding after deletion.
        Warning: Deleting a BUY that has been sold from will cause issues.
        """
        # First get existing transaction to verify portfolio and get stock_id
        existing = supabase.table("transactions") \
            .select("*") \
            .eq("id", transaction_id) \
            .eq("portfolio_id", portfolio_id) \
            .execute()
        
        if not existing.data:
            return False
        
        tx = existing.data[0]
        stock_id = tx["stock_id"]
        
        # Check if this is a BUY that has sells pointing to it
        if tx["type"] == "BUY":
            sells_from_lot = supabase.table("transactions") \
                .select("id") \
                .eq("source_transaction_id", transaction_id) \
                .execute()
            
            if sells_from_lot.data:
                raise ValueError("Nelze smazat nákup, ze kterého už byly prodány akcie")
        
        # Delete transaction
        supabase.table("transactions") \
            .delete() \
            .eq("id", transaction_id) \
            .execute()
        
        # Recalculate holding
        await self._recalculate_holding(portfolio_id, stock_id)
        
        return True


class TransactionUpdate(BaseModel):
    """Update model for transactions - all fields optional."""
    shares: Optional[float] = None
    price_per_share: Optional[float] = None
    currency: Optional[str] = None
    exchange_rate_to_czk: Optional[float] = None
    fees: Optional[float] = None
    notes: Optional[str] = None
    executed_at: Optional[datetime] = None


portfolio_service = PortfolioService()
