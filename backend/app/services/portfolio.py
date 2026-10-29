import logging

from app.core.pagination import encode_cursor, older_than_filter
from app.core.supabase import supabase
from app.services.stocks import stock_service
from app.services.portfolio_accounting import (
    annotate_stock_transactions,
    calculate_stock_holding_totals,
    compute_lot_remaining_shares,
    find_position_history_error,
    holding_market_value_czk,
    require_czk_rate,
)
from app.services.market import market_service
from app.services.exchange import exchange_service
from typing import Callable, List, Optional
from datetime import datetime, timezone
from app.schemas.portfolio import (
    AvailableLot,
    PortfolioCreate,
    PortfolioSnapshot,
    PortfolioUpdate,
    TransactionCreate,
    TransactionUpdate,
)

logger = logging.getLogger(__name__)


def _normalize_timestamp(value: str) -> str:
    """ISO timestamp with explicit UTC offset, matching how stored rows are returned."""
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.isoformat()


def _require_annotated_float(transaction: dict, field_name: str) -> float:
    value = transaction.get(field_name)
    if value is None:
        raise ValueError(f"Missing annotated field {field_name} for transaction {transaction.get('id')}")
    return float(value)


class PortfolioService:

    async def _recalculate_or_undo(
        self,
        portfolio_id: str,
        stock_id: str,
        undo: Callable[[], object],
    ) -> None:
        """Recalculate the holding after a write; if that fails, undo the write.

        Keeps a transaction write and its holding recalculation all-or-nothing, so a
        failed request leaves no stored transaction that a retry would duplicate.
        """
        try:
            await self._recalculate_holding(portfolio_id, stock_id)
        except Exception:
            logger.exception("Holding recalculation failed for %s/%s, undoing write", portfolio_id, stock_id)
            try:
                undo()
            except Exception:
                logger.exception("Could not undo write for %s/%s; holding is stale until recalculated", portfolio_id, stock_id)
            raise

    async def create_transaction_record(self, tx_data: dict) -> dict:
        """Validate, insert a stock transaction and recalculate its position, all-or-nothing.

        Single entry point for writing the `transactions` table; other services
        (e.g. option settlement) go through it instead of writing rows themselves, so
        every sell is checked against the whole history of its position.
        """
        portfolio_id, stock_id = tx_data["portfolio_id"], tx_data["stock_id"]
        require_czk_rate(tx_data.get("currency"), tx_data.get("exchange_rate_to_czk"))

        if tx_data["type"] == "SELL":
            position_transactions = await self._get_stock_transactions_for_position(portfolio_id, stock_id)
            candidate = {
                **tx_data,
                "id": "",
                # Same format as stored rows (date-only values would sort before them)
                "executed_at": _normalize_timestamp(tx_data["executed_at"]),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            history_error = find_position_history_error([*position_transactions, candidate])
            if history_error:
                raise ValueError(history_error)

        created = supabase.table("transactions").insert(tx_data).execute().data[0]
        await self._recalculate_or_undo(
            portfolio_id,
            stock_id,
            undo=lambda: supabase.table("transactions").delete().eq("id", created["id"]).execute(),
        )
        return created

    async def discard_transaction_record(self, transaction: dict) -> None:
        """Compensate for a transaction created earlier in an operation that then failed.

        Runs while the original error is propagating, so it logs its own failures
        instead of raising and masking that error.
        """
        try:
            supabase.table("transactions").delete().eq("id", transaction["id"]).execute()
            await self._recalculate_holding(transaction["portfolio_id"], transaction["stock_id"])
        except Exception:
            logger.exception(
                "Could not discard transaction %s; remove it and recalculate the holding manually",
                transaction.get("id"),
            )

    async def _with_annotations(self, tx: dict, portfolio_id: str, stock_id: str) -> dict:
        """Return the stored transaction with accounting annotations.

        The write is already committed at this point, so a failure here must not
        surface as an error (the client would retry and duplicate the write).
        """
        try:
            annotated = await self._annotate_transactions(
                await self._get_stock_transactions_for_position(portfolio_id, stock_id)
            )
        except Exception:
            logger.exception("Could not annotate transaction %s after write", tx.get("id"))
            return tx
        return next((item for item in annotated if item["id"] == tx["id"]), tx)

    async def _get_transaction_row(self, portfolio_id: str, transaction_id: str) -> Optional[dict]:
        response = supabase.table("transactions") \
            .select("*") \
            .eq("id", transaction_id) \
            .eq("portfolio_id", portfolio_id) \
            .execute()
        return response.data[0] if response.data else None

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
        portfolio = response.data[0]

        try:
            from app.services.journal import journal_service
            await journal_service.get_or_create_portfolio_channel(
                portfolio["id"],
                portfolio["name"],
                user_id=user_id,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"Could not create journal channel for portfolio {portfolio['id']}: {e}"
            )

        return portfolio
    
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

        portfolio = response.data[0] if response.data else None
        if portfolio and data.name is not None:
            try:
                from app.services.journal import journal_service
                await journal_service.update_portfolio_channel_name(
                    portfolio_id=portfolio_id,
                    portfolio_name=portfolio["name"],
                    user_id=user_id,
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    f"Could not rename journal channel for portfolio {portfolio_id}: {e}"
                )

        return portfolio
    
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
            .select("*, stocks(ticker, name, currency, sector, industry, price_scale)") \
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
            .select("*, stocks(ticker, name, currency, sector, industry, price_scale), portfolios(name)") \
            .in_("portfolio_id", portfolio_ids) \
            .gt("shares", 0) \
            .execute()
        
        # Add portfolio_name to each holding
        for h in response.data:
            h["portfolio_name"] = portfolio_names.get(h["portfolio_id"], "")
        
        return response.data
    
    async def get_all_transactions(
        self,
        user_id: str,
        limit: int = 100,
        cursor: Optional[str] = None,
        stock_ticker: Optional[str] = None,
    ) -> dict:
        """
        Get transactions across all user's portfolios.

        Supports cursor-based pagination: pass the previous page's next_cursor
        to fetch the next page of older transactions. Rows are ordered by
        (executed_at, id) so transactions sharing a timestamp are never skipped.

        Returns:
            {
                "data": [...],
                "next_cursor": "<opaque cursor> | None",
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
            .order("executed_at", desc=True) \
            .order("id", desc=True)

        if stock_ticker:
            stock_response = supabase.table("stocks") \
                .select("id") \
                .eq("ticker", stock_ticker.upper()) \
                .execute()
            if not stock_response.data:
                return {"data": [], "next_cursor": None, "has_more": False}
            query = query.eq("stock_id", stock_response.data[0]["id"])

        if cursor:
            query = query.or_(older_than_filter("executed_at", cursor))

        # Fetch one extra row to determine whether more pages exist
        response = query.limit(limit + 1).execute()

        rows = response.data or []
        has_more = len(rows) > limit
        data = rows[:limit]

        next_cursor = encode_cursor(data[-1]["executed_at"], data[-1]["id"]) if (has_more and data) else None

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

    async def get_transactions(
        self,
        portfolio_id: str,
        limit: int = 50,
        stock_id: str = None,
        stock_ticker: Optional[str] = None,
    ) -> List[dict]:
        """Get recent transactions for a portfolio, optionally filtered by stock."""
        if stock_ticker and not stock_id:
            stock_response = supabase.table("stocks") \
                .select("id") \
                .eq("ticker", stock_ticker.upper()) \
                .execute()
            if not stock_response.data:
                return []
            stock_id = stock_response.data[0]["id"]

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
        
        A SELL must name the lot it sells from (source_transaction_id); the lot is
        validated against the position history before anything is stored.
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
        
        # 3. Validate (sells), store and recalculate the holding - all-or-nothing
        created_tx = await self.create_transaction_record(tx_data)

        return await self._with_annotations(created_tx, portfolio_id, stock["id"])

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
        tx = await self._get_transaction_row(portfolio_id, transaction_id)
        if not tx:
            return None
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
        
        if data.shares is not None or data.executed_at is not None:
            patched = {**tx}
            if data.shares is not None:
                patched["shares"] = data.shares
            if data.executed_at is not None:
                patched["executed_at"] = data.executed_at.isoformat()
            position_transactions = await self._get_stock_transactions_for_position(
                portfolio_id, stock_id
            )
            history_error = find_position_history_error(
                [patched if item["id"] == transaction_id else item for item in position_transactions]
            )
            if history_error:
                raise ValueError(history_error)

        require_czk_rate(
            data.currency if data.currency is not None else tx.get("currency"),
            data.exchange_rate_to_czk if data.exchange_rate_to_czk is not None else tx.get("exchange_rate_to_czk"),
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
        
        response = supabase.table("transactions") \
            .update(update_data) \
            .eq("id", transaction_id) \
            .execute()

        # Recalculate holding; restore the previous values if that fails
        previous_values = {key: tx[key] for key in update_data if key in tx}
        await self._recalculate_or_undo(
            portfolio_id,
            stock_id,
            undo=lambda: supabase.table("transactions").update(previous_values).eq("id", transaction_id).execute(),
        )

        updated_tx = response.data[0] if response.data else None
        if not updated_tx:
            return None

        return await self._with_annotations(updated_tx, portfolio_id, stock_id)

    async def delete_transaction(self, portfolio_id: str, transaction_id: str) -> bool:
        """
        Delete a transaction. Recalculates holding after deletion.
        Warning: Deleting a BUY that has been sold from will cause issues.
        """
        tx = await self._get_transaction_row(portfolio_id, transaction_id)
        if not tx:
            return False
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

        supabase.table("transactions") \
            .delete() \
            .eq("id", transaction_id) \
            .execute()

        # A retry of the delete would only report "not found", so there is nothing to
        # undo here; one retry of the recalculation covers a transient failure.
        try:
            await self._recalculate_holding(portfolio_id, stock_id)
        except Exception:
            logger.warning("Holding recalculation failed after delete, retrying once", exc_info=True)
            await self._recalculate_holding(portfolio_id, stock_id)

        return True

    async def get_portfolio_snapshot(self, portfolio_id: Optional[str], user_id: str) -> PortfolioSnapshot:
        """
        Compute live portfolio snapshot: total value, cost basis, P/L, and daily change in CZK.
        portfolio_id=None means all portfolios for the user.
        A holding without a quote is excluded from value and cost (so P/L stays consistent)
        and listed in missing_tickers.
        """
        if portfolio_id:
            holdings = await self.get_holdings(portfolio_id)
        else:
            holdings = await self.get_all_holdings(user_id)

        if not holdings:
            return PortfolioSnapshot(
                total_value_czk=0.0,
                total_cost_czk=0.0,
                total_pnl_czk=0.0,
                total_pnl_percent=0.0,
                daily_change_czk=0.0,
                daily_change_percent=0.0,
            )

        tickers = [h["stocks"]["ticker"] for h in holdings]
        quotes = await market_service.get_quotes(tickers)
        rates = await exchange_service.get_rates()

        total_value_czk = 0.0
        total_cost_czk = 0.0
        daily_change_czk = 0.0
        missing_tickers: set[str] = set()

        for holding in holdings:
            ticker = holding["stocks"]["ticker"]
            currency = holding["stocks"].get("currency") or "USD"
            scale = float(holding["stocks"].get("price_scale") or 1)
            shares = float(holding.get("shares") or 0)
            total_invested_czk = float(holding.get("total_invested_czk") or 0)
            rate = float(rates.get(currency, 1.0))

            quote = quotes.get(ticker, {})
            value_czk = holding_market_value_czk(shares, float(quote.get("price") or 0), scale, rate)
            if value_czk is None:
                missing_tickers.add(ticker)
                continue
            change = float(quote.get("change") or 0)

            total_value_czk += value_czk
            total_cost_czk += total_invested_czk
            daily_change_czk += change * scale * shares * rate

        total_pnl_czk = total_value_czk - total_cost_czk
        total_pnl_percent = (total_pnl_czk / total_cost_czk * 100) if total_cost_czk > 0 else 0.0
        prev_value = total_value_czk - daily_change_czk
        daily_change_percent = (daily_change_czk / prev_value * 100) if prev_value > 0 else 0.0

        return PortfolioSnapshot(
            total_value_czk=round(total_value_czk, 2),
            total_cost_czk=round(total_cost_czk, 2),
            total_pnl_czk=round(total_pnl_czk, 2),
            total_pnl_percent=round(total_pnl_percent, 4),
            daily_change_czk=round(daily_change_czk, 2),
            daily_change_percent=round(daily_change_percent, 4),
            missing_tickers=sorted(missing_tickers),
        )


portfolio_service = PortfolioService()
