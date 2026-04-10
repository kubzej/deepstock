from app.core.supabase import supabase
from app.services.stocks import stock_service
from app.services.portfolio_accounting import (
    annotate_stock_transactions,
    calculate_stock_holding_totals,
    compute_lot_remaining_shares,
)
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone


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
    economic_price_per_share: float
    remaining_cost_basis: float
    remaining_cost_basis_czk: float


def _require_annotated_float(transaction: dict, field_name: str) -> float:
    value = transaction.get(field_name)
    if value is None:
        raise ValueError(f"Missing annotated field {field_name} for transaction {transaction.get('id')}")
    return float(value)


class TransactionUpdate(BaseModel):
    """Update model for transactions - all fields optional."""
    shares: Optional[float] = None
    price_per_share: Optional[float] = None
    currency: Optional[str] = None
    exchange_rate_to_czk: Optional[float] = None
    fees: Optional[float] = None
    notes: Optional[str] = None
    executed_at: Optional[datetime] = None


class PortfolioService:

    async def _get_stock_transactions_for_position(
        self,
        portfolio_id: str,
        stock_id: str,
    ) -> List[dict]:
        response = supabase.table("transactions") \
            .select("*") \
            .eq("portfolio_id", portfolio_id) \
            .eq("stock_id", stock_id) \
            .order("executed_at", desc=False) \
            .execute()
        return response.data or []

    async def _get_transaction_context(self, transactions: List[dict]) -> List[dict]:
        if not transactions:
            return []

        contexts: List[dict] = []
        seen_pairs: set[tuple[str, str]] = set()

        for tx in transactions:
            pair = (tx["portfolio_id"], tx["stock_id"])
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            contexts.extend(
                await self._get_stock_transactions_for_position(
                    tx["portfolio_id"],
                    tx["stock_id"],
                )
            )

        unique_by_id = {tx["id"]: tx for tx in contexts}
        return list(unique_by_id.values())

    async def _annotate_transactions(self, transactions: List[dict]) -> List[dict]:
        if not transactions:
            return []
        context_transactions = await self._get_transaction_context(transactions)
        annotated = annotate_stock_transactions(context_transactions)
        annotated_by_id = {tx["id"]: tx for tx in annotated}
        return [
            {**tx, **annotated_by_id.get(tx["id"], {})}
            for tx in transactions
        ]

    async def _get_sold_amount_for_buy_lot(self, buy_tx: dict) -> float:
        """
        Return how many shares from a BUY transaction were already sold.

        Covers both linked sells (source_transaction_id) and FIFO fallback
        sells (no source_transaction_id) via the canonical accounting engine.
        """
        buy_id = buy_tx["id"]
        original_shares = float(buy_tx["shares"])

        transactions = await self._get_stock_transactions_for_position(
            buy_tx["portfolio_id"], buy_tx["stock_id"]
        )
        remaining = compute_lot_remaining_shares(transactions)
        return original_shares - remaining.get(buy_id, 0.0)
    
    async def get_user_portfolios(self, user_id: str) -> List[dict]:
        """Get all portfolios for a user."""
        response = supabase.table("portfolios") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        return response.data

    async def verify_portfolio_ownership(self, portfolio_id: str, user_id: str) -> bool:
        """Check that a portfolio belongs to the given user."""
        response = supabase.table("portfolios") \
            .select("id") \
            .eq("id", portfolio_id) \
            .eq("user_id", user_id) \
            .execute()
        return bool(response.data)
    
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
        """Recalculate all historical holdings for a portfolio."""
        transaction_rows = supabase.table("transactions") \
            .select("stock_id") \
            .eq("portfolio_id", portfolio_id) \
            .execute()

        holding_rows = supabase.table("holdings") \
            .select("stock_id") \
            .eq("portfolio_id", portfolio_id) \
            .execute()

        stock_ids = sorted(
            {
                row["stock_id"]
                for row in [
                    *(transaction_rows.data or []),
                    *(holding_rows.data or []),
                ]
                if row.get("stock_id")
            }
        )

        for stock_id in stock_ids:
            await self._recalculate_holding(portfolio_id, stock_id)

        return {
            "portfolio_id": portfolio_id,
            "recalculated": len(stock_ids),
        }

    async def recalculate_all_user_holdings(self, user_id: str) -> dict:
        """Recalculate holdings across all portfolios owned by the user."""
        portfolios = await self.get_user_portfolios(user_id)
        recalculated = 0

        for portfolio in portfolios:
            result = await self.recalculate_all_holdings(portfolio["id"])
            recalculated += result["recalculated"]

        return {
            "portfolios": len(portfolios),
            "recalculated": recalculated,
        }
    
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
    
    async def get_all_transactions(
        self, user_id: str, limit: int = 100, cursor: Optional[str] = None
    ) -> dict:
        """
        Get transactions across all user's portfolios.

        Supports cursor-based pagination: pass cursor (ISO datetime of the
        last seen executed_at) to fetch the next page of older transactions.

        Returns:
            {
                "data": [...],
                "next_cursor": "<ISO datetime> | None",
                "has_more": bool,
            }
        """
        portfolios = await self.get_user_portfolios(user_id)
        if not portfolios:
            return {"data": [], "next_cursor": None, "has_more": False}

        portfolio_ids = [p["id"] for p in portfolios]
        portfolio_names = {p["id"]: p["name"] for p in portfolios}

        query = supabase.table("transactions") \
            .select("*, stocks(ticker, name), source_transaction:source_transaction_id(id, executed_at, price_per_share, currency, shares), portfolios(name)") \
            .in_("portfolio_id", portfolio_ids) \
            .order("executed_at", desc=True)

        if cursor:
            query = query.lt("executed_at", cursor)

        # Fetch one extra row to determine whether more pages exist
        response = query.limit(limit + 1).execute()

        rows = response.data or []
        has_more = len(rows) > limit
        data = rows[:limit]

        next_cursor = data[-1]["executed_at"] if (has_more and data) else None

        annotated = await self._annotate_transactions(data)

        for tx in annotated:
            tx["portfolio_name"] = portfolio_names.get(tx["portfolio_id"], "")

        return {"data": annotated, "next_cursor": next_cursor, "has_more": has_more}
    
    async def get_all_open_lots_for_user(self, user_id: str) -> List[dict]:
        """
        Get all open lots across ALL user's portfolios.
        Returns BUY transactions with remaining shares, enriched with stock info and portfolio name.
        """
        portfolios = await self.get_user_portfolios(user_id)
        if not portfolios:
            return []

        portfolio_ids = [p["id"] for p in portfolios]
        portfolio_names = {p["id"]: p["name"] for p in portfolios}

        buy_response = supabase.table("transactions") \
            .select("*, stocks(ticker, name, currency, price_scale)") \
            .in_("portfolio_id", portfolio_ids) \
            .eq("type", "BUY") \
            .order("executed_at", desc=False) \
            .execute()

        # _annotate_transactions groups by (portfolio_id, stock_id) and loads the full
        # position context per pair — FIFO is computed correctly within each portfolio.
        buy_transactions = await self._annotate_transactions(buy_response.data or [])

        open_lots = []
        for buy in buy_transactions:
            remaining = float(buy["remaining_shares"])

            if remaining > 0.0001:
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
                    "economicBuyPrice": _require_annotated_float(buy, "economic_amount") / float(buy["shares"]),
                    "currency": stock_info.get("currency") or buy.get("currency") or "USD",
                    "priceScale": price_scale,
                    "exchangeRate": float(buy["exchange_rate_to_czk"]) if buy.get("exchange_rate_to_czk") else None,
                    "remainingCostBasis": _require_annotated_float(buy, "remaining_cost_basis"),
                    "remainingCostBasisCzk": _require_annotated_float(buy, "remaining_cost_basis_czk"),
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
        return await self._annotate_transactions(response.data or [])
    
    async def add_transaction(self, portfolio_id: str, data: TransactionCreate, user_id: str = None) -> dict:
        """
        Add a transaction and update holdings.
        This is the core logic for portfolio management.
        
        For SELL transactions:
        - If source_transaction_id is provided, sell from that specific lot
        - Otherwise, use FIFO (oldest lots first)
        """
        # 1. Ensure stock exists in master table
        stock = await stock_service.get_or_create(data.stock_ticker, data.stock_name, user_id=user_id)
        
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
        
        # 3. Validate available shares for SELL
        if data.type.upper() == "SELL":
            holding = supabase.table("holdings") \
                .select("shares") \
                .eq("portfolio_id", portfolio_id) \
                .eq("stock_id", stock["id"]) \
                .execute()
            available = float(holding.data[0]["shares"]) if holding.data else 0.0
            if data.shares > available:
                raise ValueError(
                    f"Nedostatek akcií: k dispozici {available}, požadováno {data.shares}"
                )

        tx_response = supabase.table("transactions") \
            .insert(tx_data) \
            .execute()

        # 4. Update holdings (recalculate position)
        await self._recalculate_holding(portfolio_id, stock["id"])
        
        created_tx = tx_response.data[0]
        annotated_transactions = await self._annotate_transactions(
            await self._get_stock_transactions_for_position(portfolio_id, stock["id"])
        )
        return next(
            (tx for tx in annotated_transactions if tx["id"] == created_tx["id"]),
            created_tx,
        )
    
    async def get_all_open_lots(self, portfolio_id: str) -> List[dict]:
        """
        Get all open lots across all holdings in a portfolio.
        Returns BUY transactions with remaining shares, enriched with stock info.
        """
        buy_response = supabase.table("transactions") \
            .select("*, stocks(ticker, name, currency, price_scale)") \
            .eq("portfolio_id", portfolio_id) \
            .eq("type", "BUY") \
            .order("executed_at", desc=False) \
            .execute()

        # _annotate_transactions loads the full position context (buys + sells)
        # and sets remaining_shares correctly for both linked and FIFO sells.
        buy_transactions = await self._annotate_transactions(buy_response.data or [])

        open_lots = []
        for buy in buy_transactions:
            remaining = float(buy["remaining_shares"])

            if remaining > 0.0001:
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
                    "economicBuyPrice": _require_annotated_float(buy, "economic_amount") / float(buy["shares"]),
                    "currency": stock_info.get("currency") or buy.get("currency") or "USD",
                    "priceScale": price_scale,
                    "exchangeRate": float(buy["exchange_rate_to_czk"]) if buy.get("exchange_rate_to_czk") else None,
                    "remainingCostBasis": _require_annotated_float(buy, "remaining_cost_basis"),
                    "remainingCostBasisCzk": _require_annotated_float(buy, "remaining_cost_basis_czk"),
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

        # Get all BUY transactions for this stock/portfolio.
        # _annotate_transactions loads the full position context (buys + sells)
        # and computes remaining_shares correctly for both linked and FIFO sells.
        buy_response = supabase.table("transactions") \
            .select("*") \
            .eq("stock_id", stock_id) \
            .eq("portfolio_id", portfolio_id) \
            .eq("type", "BUY") \
            .order("executed_at", desc=False) \
            .execute()

        buy_transactions = await self._annotate_transactions(buy_response.data or [])

        available_lots: List[AvailableLot] = []
        for buy in buy_transactions:
            remaining = float(buy["remaining_shares"])

            if remaining > 0.0001:
                available_lots.append(AvailableLot(
                    id=buy["id"],
                    date=buy["executed_at"][:10] if buy["executed_at"] else "",
                    quantity=float(buy["shares"]),
                    remaining_shares=remaining,
                    price_per_share=float(buy["price_per_share"]),
                    currency=buy["currency"] or "USD",
                    total_amount=float(buy["total_amount"] or 0),
                    economic_price_per_share=(
                        _require_annotated_float(buy, "economic_amount") / float(buy["shares"])
                    ),
                    remaining_cost_basis=_require_annotated_float(buy, "remaining_cost_basis"),
                    remaining_cost_basis_czk=_require_annotated_float(buy, "remaining_cost_basis_czk"),
                ))

        return available_lots
    
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
        
        calculation = calculate_stock_holding_totals(transactions)
        avg_cost = (
            calculation.total_cost / calculation.shares
            if calculation.shares > 0
            else 0
        )
        
        # Upsert holding
        supabase.table("holdings") \
            .upsert({
                "portfolio_id": portfolio_id,
                "stock_id": stock_id,
                "shares": calculation.shares,
                "avg_cost_per_share": round(avg_cost, 4),
                "total_cost": round(calculation.total_cost, 4),
                "total_invested_czk": round(calculation.total_invested_czk, 4),
                "realized_pnl": round(calculation.realized_pnl, 4),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }, on_conflict="portfolio_id,stock_id") \
            .execute()

    async def update_transaction(self, portfolio_id: str, transaction_id: str, data: TransactionUpdate) -> Optional[dict]:
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

        # Lot integrity guard:
        # If this BUY lot is already consumed by SELL transactions (linked or FIFO fallback),
        # block updates that would affect cost basis / chronology.
        if tx["type"] == "BUY":
            sold_amount = await self._get_sold_amount_for_buy_lot(tx)
            modifies_fifo_fields = any([
                data.shares is not None,
                data.price_per_share is not None,
                data.currency is not None,
                data.exchange_rate_to_czk is not None,
                data.executed_at is not None,
            ])

            if sold_amount > 0 and modifies_fifo_fields:
                raise ValueError(
                    "Nelze upravit tento nákup, protože z něj už byly provedeny prodeje (SELL) "
                    "- navázané na lot nebo přes fallback alokaci. "
                    "Nejprve upravte nebo smažte navázané SELL transakce."
                )
        
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
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        response = supabase.table("transactions") \
            .update(update_data) \
            .eq("id", transaction_id) \
            .execute()
        
        # Recalculate holding
        await self._recalculate_holding(portfolio_id, stock_id)
        
        updated_tx = response.data[0] if response.data else None
        if not updated_tx:
            return None

        annotated_transactions = await self._annotate_transactions(
            await self._get_stock_transactions_for_position(portfolio_id, stock_id)
        )
        return next(
            (item for item in annotated_transactions if item["id"] == updated_tx["id"]),
            updated_tx,
        )

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
        
        # Check if this BUY was already consumed by SELL transactions
        if tx["type"] == "BUY":
            sold_amount = await self._get_sold_amount_for_buy_lot(tx)

            if sold_amount > 0:
                raise ValueError(
                    "Nelze smazat tento nákup, protože z něj už byly provedeny prodeje (SELL) "
                    "- navázané na lot nebo přes fallback alokaci. "
                    "Nejprve upravte nebo smažte navázané SELL transakce."
                )
        
        # Delete transaction
        supabase.table("transactions") \
            .delete() \
            .eq("id", transaction_id) \
            .execute()
        
        # Recalculate holding
        await self._recalculate_holding(portfolio_id, stock_id)
        
        return True


portfolio_service = PortfolioService()
