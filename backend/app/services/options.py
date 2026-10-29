"""
Options Trading Service for DeepStock.
Handles CRUD operations for option transactions and holdings.
"""
import json
import logging
from app.core.pagination import encode_cursor, older_than_filter
from app.core.redis import get_redis
from app.core.supabase import supabase
from app.services.market.options_quotes import get_option_quotes
from app.services.options_accounting import (
    annotate_option_transactions,
    calculate_option_accounting,
    preview_option_close,
)
from app.services.portfolio_accounting import require_czk_rate
from typing import List, Optional
from datetime import date, datetime, timezone
from app.schemas.options import OptionAction, OptionTransactionCreate, OptionType

logger = logging.getLogger(__name__)


# ==========================================
# OCC Symbol Generator
# ==========================================

def generate_occ_symbol(
    ticker: str,
    strike: float,
    expiration_date: date,
    option_type: OptionType
) -> str:
    """
    Generate OCC option symbol.
    Format: [Ticker][YYMMDD][C/P][Strike × 1000 (8 digits)]
    
    Example:
    - AAPL, 150, 2025-01-17, call -> AAPL250117C00150000
    - TSLA, 200.5, 2025-03-21, put -> TSLA250321P00200500
    """
    ticker_clean = ticker.upper().strip()
    
    # Date: YYMMDD
    date_str = expiration_date.strftime("%y%m%d")
    
    # Type: C or P
    type_char = "C" if option_type == "call" else "P"
    
    # Strike: × 1000, 8 digits, zero-padded
    strike_int = round(strike * 1000)
    strike_padded = str(strike_int).zfill(8)
    
    return f"{ticker_clean}{date_str}{type_char}{strike_padded}"


def get_option_stock_transaction_terms(
    *,
    closing_action: str,
    position: str,
    option_type: str,
    strike_price: float,
    transferred_entry_per_share: float,
) -> tuple[str, float]:
    """Return the stock side of an option exercise or assignment.

    Option premium is already included in ``transferred_entry_per_share``.
    The sign depends on whether the linked stock transaction buys or sells
    shares and whether the option was long or short.
    """
    if closing_action == "ASSIGNMENT":
        transaction_type = "BUY" if option_type == "put" else "SELL"
    elif closing_action == "EXERCISE":
        transaction_type = "BUY" if option_type == "call" else "SELL"
    else:
        raise ValueError(f"Unsupported stock-linked option action: {closing_action}")

    if transaction_type == "BUY":
        effective_price = (
            strike_price - transferred_entry_per_share
            if position == "short"
            else strike_price + transferred_entry_per_share
        )
    else:
        effective_price = (
            strike_price + transferred_entry_per_share
            if position == "short"
            else strike_price - transferred_entry_per_share
        )

    return transaction_type, effective_price


# ==========================================
# Options Service
# ==========================================

class OptionsService:
    """Service for managing option transactions."""

    async def _get_transactions_for_symbols(
        self,
        portfolio_ids: list[str],
        option_symbols: Optional[list[str]] = None,
    ) -> List[dict]:
        if not portfolio_ids:
            return []

        query = supabase.table("option_transactions") \
            .select("*") \
            .in_("portfolio_id", portfolio_ids) \
            .order("date", desc=False)

        if option_symbols:
            query = query.in_("option_symbol", option_symbols)

        response = query.execute()
        return response.data or []

    async def _annotate_transactions(
        self,
        transactions: List[dict],
    ) -> List[dict]:
        if not transactions:
            return []

        portfolio_ids = sorted({tx["portfolio_id"] for tx in transactions})
        option_symbols = sorted({tx["option_symbol"] for tx in transactions})
        context_transactions = await self._get_transactions_for_symbols(
            portfolio_ids,
            option_symbols=option_symbols,
        )
        annotated = annotate_option_transactions(context_transactions)
        annotated_by_id = {tx["id"]: tx for tx in annotated}
        return [{**tx, **annotated_by_id.get(tx["id"], {})} for tx in transactions]

    def _overlay_holding_economics(
        self,
        holdings: List[dict],
        transactions: List[dict],
    ) -> List[dict]:
        grouped_transactions: dict[tuple[str, str], list[dict]] = {}
        for tx in transactions:
            key = (tx["portfolio_id"], tx["option_symbol"])
            grouped_transactions.setdefault(key, []).append(tx)

        enriched_holdings: List[dict] = []
        for holding in holdings:
            key = (holding["portfolio_id"], holding["option_symbol"])
            accounting = calculate_option_accounting(grouped_transactions.get(key, []))
            merged = dict(holding)

            if accounting.holding.position is not None:
                merged["position"] = accounting.holding.position
                merged["contracts"] = accounting.holding.contracts
                merged["avg_premium"] = (
                    round(accounting.holding.avg_premium, 4)
                    if accounting.holding.avg_premium is not None
                    else None
                )
                merged["total_cost"] = round(accounting.holding.total_cost, 4)

            enriched_holdings.append(merged)

        return enriched_holdings
    
    async def _overlay_underlying_quotes(self, holdings: List[dict]) -> List[dict]:
        """Fill underlying price, moneyness and buffer from already-cached quotes.

        Reads the Redis quote cache only (never triggers a provider fetch); a
        ticker without a cached quote keeps the NULLs from the view.
        """
        redis = get_redis()
        prices: dict[str, float] = {}
        for symbol in {h["symbol"] for h in holdings if h.get("symbol")}:
            try:
                cached = await redis.get(f"quote:{symbol}")
                price = json.loads(cached).get("price") if cached else None
            except Exception as e:
                logger.warning(f"Could not read cached quote for {symbol}: {e}")
                continue
            if price:
                prices[symbol] = float(price)

        for holding in holdings:
            price = prices.get(holding.get("symbol"))
            strike = holding.get("strike_price")
            if price is None or strike is None:
                continue
            strike = float(strike)
            is_call = holding.get("option_type") == "call"
            if price == strike:
                moneyness = "ATM"
            elif (price > strike) == is_call:
                moneyness = "ITM"
            else:
                moneyness = "OTM"
            distance = (strike - price) if is_call else (price - strike)
            holding["underlying_price"] = price
            holding["underlying_price_source"] = "market"
            holding["moneyness"] = moneyness
            holding["buffer_percent"] = round(distance / price * 100, 2)

        return holdings

    # ==========================================
    # Transactions CRUD
    # ==========================================
    
    async def get_transactions_page(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        symbol: Optional[str] = None,
        option_symbol: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> dict:
        """
        Get one page of option transactions for a user, newest first.
        Optionally filter by portfolio_id, underlying symbol, or OCC option_symbol.

        Pass the previous page's next_cursor as cursor to load older rows. Rows are ordered by
        (date, id) so transactions sharing a date are never skipped.

        Returns {"data": [...], "next_cursor": "<opaque cursor> | None", "has_more": bool}.
        """
        empty_page = {"data": [], "next_cursor": None, "has_more": False}

        # First get user's portfolio IDs
        portfolios_response = supabase.table("portfolios") \
            .select("id") \
            .eq("user_id", user_id) \
            .execute()
        
        user_portfolio_ids = [p["id"] for p in portfolios_response.data]
        
        if not user_portfolio_ids:
            return empty_page
        
        query = supabase.table("option_transactions") \
            .select("*, portfolios(name)") \
            .in_("portfolio_id", user_portfolio_ids) \
            .order("date", desc=True) \
            .order("id", desc=True)
        
        if portfolio_id:
            # Additional filter if specific portfolio requested
            if portfolio_id not in user_portfolio_ids:
                return empty_page  # User doesn't own this portfolio
            query = query.eq("portfolio_id", portfolio_id)
        
        if symbol:
            query = query.eq("symbol", symbol.upper())
        
        if option_symbol:
            query = query.eq("option_symbol", option_symbol)

        if cursor:
            query = query.or_(older_than_filter("date", cursor))

        # Fetch one extra row to determine whether more pages exist
        response = query.limit(limit + 1).execute()

        rows = response.data or []
        has_more = len(rows) > limit
        page = rows[:limit]
        next_cursor = encode_cursor(page[-1]["date"], page[-1]["id"]) if (has_more and page) else None
        
        # Add portfolio_name to each transaction
        result = []
        for tx in page:
            tx["portfolio_name"] = tx.get("portfolios", {}).get("name", "") if tx.get("portfolios") else ""
            del tx["portfolios"]  # Remove nested object
            result.append(tx)
        
        return {
            "data": await self._annotate_transactions(result),
            "next_cursor": next_cursor,
            "has_more": has_more,
        }

    async def get_transactions(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        symbol: Optional[str] = None,
        option_symbol: Optional[str] = None,
        limit: int = 100,
    ) -> List[dict]:
        """The newest `limit` option transactions (first page only), for callers that want a bounded list."""
        page = await self.get_transactions_page(user_id, portfolio_id, symbol, option_symbol, limit)
        return page["data"]
    
    async def create_transaction(
        self, 
        portfolio_id: str, 
        data: OptionTransactionCreate
    ) -> dict:
        """
        Create a new option transaction.
        Automatically generates OCC symbol.
        """
        require_czk_rate(data.currency, data.exchange_rate_to_czk)

        # Generate OCC symbol
        option_symbol = generate_occ_symbol(
            data.symbol,
            data.strike_price,
            data.expiration_date,
            data.option_type
        )
        
        insert_data = {
            "portfolio_id": portfolio_id,
            "symbol": data.symbol.upper(),
            "option_symbol": option_symbol,
            "option_type": data.option_type,
            "strike_price": data.strike_price,
            "expiration_date": data.expiration_date.isoformat(),
            "action": data.action,
            "contracts": data.contracts,
            "premium": data.premium,
            "currency": data.currency,
            "exchange_rate_to_czk": data.exchange_rate_to_czk,
            "fees": data.fees,
            "date": data.date.isoformat(),
            "notes": data.notes,
        }
        
        response = supabase.table("option_transactions") \
            .insert(insert_data) \
            .execute()

        created_tx = response.data[0]
        annotated = await self._annotate_transactions([created_tx])
        return annotated[0] if annotated else created_tx
    
    async def delete_transactions_by_symbol(
        self, 
        portfolio_id: str, 
        option_symbol: str
    ) -> int:
        """Delete all transactions for a specific option position."""
        response = supabase.table("option_transactions") \
            .delete() \
            .eq("portfolio_id", portfolio_id) \
            .eq("option_symbol", option_symbol) \
            .execute()
        
        return len(response.data)
    
    # ==========================================
    # Holdings (from VIEW)
    # ==========================================
    
    async def get_holdings(
        self, 
        portfolio_id: Optional[str] = None,
        symbol: Optional[str] = None
    ) -> List[dict]:
        """
        Get option holdings (open positions).
        Uses the option_holdings VIEW which calculates positions from transactions.
        """
        query = supabase.table("option_holdings") \
            .select("*") \
            .order("expiration_date", desc=False)
        
        if portfolio_id:
            query = query.eq("portfolio_id", portfolio_id)
        
        if symbol:
            query = query.eq("symbol", symbol.upper())
        
        response = query.execute()
        holdings = response.data or []
        if not holdings:
            return []

        option_symbols = [h["option_symbol"] for h in holdings if h.get("option_symbol")]
        transactions = await self._get_transactions_for_symbols(
            [portfolio_id] if portfolio_id else [],
            option_symbols=option_symbols,
        )
        holdings = self._overlay_holding_economics(holdings, transactions)
        return await self._overlay_underlying_quotes(holdings)
    
    async def get_all_holdings_for_user(self, user_id: str) -> List[dict]:
        """
        Get all option holdings across all user's portfolios.
        Requires joining with portfolios to filter by user.
        """
        # First get user's portfolio IDs
        portfolios = supabase.table("portfolios") \
            .select("id") \
            .eq("user_id", user_id) \
            .execute()
        
        if not portfolios.data:
            return []
        
        portfolio_ids = [p["id"] for p in portfolios.data]
        
        # Then get holdings for those portfolios
        response = supabase.table("option_holdings") \
            .select("*") \
            .in_("portfolio_id", portfolio_ids) \
            .order("expiration_date", desc=False) \
            .execute()

        holdings = response.data or []
        if not holdings:
            return []

        option_symbols = [h["option_symbol"] for h in holdings if h.get("option_symbol")]
        transactions = await self._get_transactions_for_symbols(
            portfolio_ids,
            option_symbols=option_symbols,
        )
        holdings = self._overlay_holding_economics(holdings, transactions)
        return await self._overlay_underlying_quotes(holdings)
    
    # ==========================================
    # Option Prices
    # ==========================================
    
    async def get_prices(self, option_symbols: List[str]) -> List[dict]:
        """Get cached prices for multiple option symbols."""
        if not option_symbols:
            return []
        
        response = supabase.table("option_prices") \
            .select("*") \
            .in_("option_symbol", option_symbols) \
            .execute()
        
        return response.data

    async def fetch_live_prices(self, option_symbols: List[str]) -> List[dict]:
        """
        Fetch live option prices from Yahoo Finance via yfinance.
        Updates the option_prices cache and returns the results.
        
        Uses the shared Redis-backed option quote cache first and only fetches
        missing/expired OCC symbols from Yahoo Finance.
        """
        if not option_symbols:
            return []

        redis = get_redis()
        quotes_by_symbol = await get_option_quotes(redis, option_symbols)

        results = []
        for occ_symbol in option_symbols:
            quote = quotes_by_symbol.get(occ_symbol)
            if not quote or quote.get("price") is None:
                continue

            result = {
                "option_symbol": occ_symbol,
                "price": quote.get("price"),
                "bid": quote.get("bid"),
                "ask": quote.get("ask"),
                "volume": quote.get("volume"),
                "open_interest": quote.get("openInterest"),
                "implied_volatility": quote.get("impliedVolatility"),
                "updated_at": quote.get("lastUpdated")
                or datetime.now(timezone.utc).isoformat(),
            }

            try:
                supabase.table("option_prices") \
                    .upsert(result, on_conflict="option_symbol") \
                    .execute()
                results.append(result)
            except Exception as e:
                logger.warning(f"Failed to upsert price: {e}")
        
        return results
    
    # ==========================================
    # Statistics
    # ==========================================
    
    async def get_stats(self, portfolio_id: Optional[str] = None) -> dict:
        """Get summary statistics for option holdings."""
        holdings = await self.get_holdings(portfolio_id)
        
        from datetime import timedelta
        today = date.today()
        week_from_now = today + timedelta(days=7)
        
        stats = {
            "total_positions": len(holdings),
            "long_positions": len([h for h in holdings if h.get("position") == "long"]),
            "short_positions": len([h for h in holdings if h.get("position") == "short"]),
            "expiring_this_week": len([
                h for h in holdings 
                if h.get("expiration_date") and 
                date.fromisoformat(h["expiration_date"]) <= week_from_now
            ]),
            "calls": len([h for h in holdings if h.get("option_type") == "call"]),
            "puts": len([h for h in holdings if h.get("option_type") == "put"]),
            "total_cost": sum(float(h.get("total_cost") or 0) for h in holdings),
            "itm_count": len([h for h in holdings if h.get("moneyness") == "ITM"]),
            "otm_count": len([h for h in holdings if h.get("moneyness") == "OTM"]),
        }
        
        return stats
    
    # ==========================================
    # Close Position Helpers
    # ==========================================
    
    async def close_position(
        self,
        portfolio_id: str,
        option_symbol: str,
        closing_action: OptionAction,
        contracts: int,
        premium: Optional[float],
        close_date: date,
        fees: float = 0,
        exchange_rate_to_czk: Optional[float] = None,
        notes: Optional[str] = None,
        source_transaction_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> tuple[dict, Optional[dict]]:
        """
        Close an existing option position.
        
        For ASSIGNMENT/EXERCISE, creates a linked stock transaction:
        - Short PUT -> ASSIGNMENT: BUY shares at strike
        - Short CALL -> ASSIGNMENT: SELL shares at strike (requires source_transaction_id)
        - Long CALL -> EXERCISE: BUY shares at strike
        - Long PUT -> EXERCISE: SELL shares at strike (requires source_transaction_id)
        """
        if closing_action in ("BTC", "STC") and premium is None:
            raise ValueError(f"Pro {closing_action} je nutné zadat prémii")

        # Get current holding
        holdings = await self.get_holdings(portfolio_id, symbol=None)
        holding = next(
            (h for h in holdings if h["option_symbol"] == option_symbol),
            None
        )
        
        if not holding:
            raise ValueError(f"No open position found for {option_symbol}")
        
        # Validate closing action
        position = holding["position"]
        valid_close_actions = {
            "long": ["STC", "EXPIRATION", "EXERCISE"],
            "short": ["BTC", "EXPIRATION", "ASSIGNMENT"],
        }
        
        if closing_action not in valid_close_actions.get(position, []):
            raise ValueError(
                f"Invalid closing action {closing_action} for {position} position. "
                f"Valid actions: {valid_close_actions[position]}"
            )
        
        # Check contracts
        if contracts > holding["contracts"]:
            raise ValueError(
                f"Cannot close {contracts} contracts, only {holding['contracts']} open"
            )
        
        existing_transactions = await self._get_transactions_for_symbols(
            [portfolio_id],
            option_symbols=[option_symbol],
        )
        preview = preview_option_close(
            existing_transactions,
            action=closing_action,
            contracts=contracts,
            premium=premium,
            fees=fees,
            exchange_rate_to_czk=exchange_rate_to_czk,
        )
        if preview is None:
            raise ValueError(f"Cannot preview close for {option_symbol}")

        avg_premium = float(holding.get("avg_premium") or 0)
        closing_premium = float(premium) if premium else 0
        realized_pl = preview.realized_pl

        # Currency comes from the holding (view exposes it from the opening transaction)
        option_currency = holding.get("currency") or "USD"
        if closing_action != "EXPIRATION":  # an expiry moves no money, so it needs no rate
            require_czk_rate(option_currency, exchange_rate_to_czk)

        # Closing an option by ASSIGNMENT/EXERCISE also writes a stock transaction. The two
        # writes are all-or-nothing: if the option side fails, the stock side is taken back.
        linked_stock_tx = None
        try:
            if closing_action in ["ASSIGNMENT", "EXERCISE"]:
                linked_stock_tx = await self._create_stock_transaction_for_option_close(
                    portfolio_id=portfolio_id,
                    holding=holding,
                    closing_action=closing_action,
                    contracts=contracts,
                    close_date=close_date,
                    exchange_rate_to_czk=exchange_rate_to_czk,
                    source_transaction_id=source_transaction_id,
                    notes=notes,
                    transferred_entry_per_share=preview.transferred_entry_per_share,
                    user_id=user_id,
                )

            option_symbol_value = generate_occ_symbol(
                holding["symbol"],
                float(holding["strike_price"]),
                date.fromisoformat(holding["expiration_date"]),
                holding["option_type"]
            )

            insert_data = {
                "portfolio_id": portfolio_id,
                "symbol": holding["symbol"].upper(),
                "option_symbol": option_symbol_value,
                "option_type": holding["option_type"],
                "strike_price": float(holding["strike_price"]),
                "expiration_date": holding["expiration_date"],
                "action": closing_action,
                "contracts": contracts,
                "premium": closing_premium if closing_action in ["BTC", "STC"] else avg_premium,
                "currency": option_currency,
                "exchange_rate_to_czk": exchange_rate_to_czk,
                "fees": fees,
                "date": close_date.isoformat(),
                "notes": notes,
                "linked_stock_tx_id": linked_stock_tx["id"] if linked_stock_tx else None,
            }

            response = supabase.table("option_transactions") \
                .insert(insert_data) \
                .execute()
        except Exception:
            if linked_stock_tx:
                from app.services.portfolio import portfolio_service
                await portfolio_service.discard_transaction_record(linked_stock_tx)
            raise

        logger.info(
            f"Closed option position {option_symbol_value} with {closing_action}: "
            f"realized P/L = ${realized_pl:.2f}"
        )

        created_tx = response.data[0]
        # Both writes are committed; a failure while annotating must not look like a failed close
        try:
            annotated = await self._annotate_transactions([created_tx])
        except Exception:
            logger.exception("Could not annotate option transaction %s after close", created_tx.get("id"))
            annotated = []
        return (annotated[0] if annotated else created_tx), linked_stock_tx

    async def _create_stock_transaction_for_option_close(
        self,
        portfolio_id: str,
        holding: dict,
        closing_action: str,
        contracts: int,
        close_date: date,
        exchange_rate_to_czk: Optional[float],
        source_transaction_id: Optional[str],
        notes: Optional[str],
        transferred_entry_per_share: float,
        user_id: Optional[str] = None,
    ) -> dict:
        """
        Create a stock transaction when an option is assigned/exercised.
        
        Fee-aware option entry economics are transferred into the effective stock price
        on settlement so stock-side accounting stays economically consistent.
        """
        from app.services.stocks import stock_service
        
        position = holding["position"]
        option_type = holding["option_type"]
        strike_price = float(holding["strike_price"])
        symbol = holding["symbol"]
        shares = contracts * 100
        
        tx_type, effective_price = get_option_stock_transaction_terms(
            closing_action=closing_action,
            position=position,
            option_type=option_type,
            strike_price=strike_price,
            transferred_entry_per_share=transferred_entry_per_share,
        )
        
        # For SELL transactions, we need source_transaction_id
        if tx_type == "SELL" and not source_transaction_id:
            raise ValueError(
                f"Pro {closing_action} {option_type} opce je nutné vybrat lot akcií k prodeji"
            )
        
        # Get or create stock
        stock = await stock_service.get_or_create(symbol, user_id=user_id)

        # Currency comes from the holding (view exposes it from the opening transaction)
        stock_currency = holding.get("currency") or "USD"

        # Calculate totals
        total_amount = shares * effective_price
        total_amount_czk = total_amount * exchange_rate_to_czk if exchange_rate_to_czk else None

        # Build note with details about the adjustment
        if transferred_entry_per_share > 0:
            tx_notes = (
                f"{closing_action} from {holding['option_symbol']} "
                f"(strike {strike_price} {stock_currency}, "
                f"option economics {transferred_entry_per_share:.4f} {stock_currency}/share)"
            )
        else:
            tx_notes = f"{closing_action} from {holding['option_symbol']}"
        if notes:
            tx_notes = f"{tx_notes} - {notes}"

        tx_data = {
            "portfolio_id": portfolio_id,
            "stock_id": stock["id"],
            "type": tx_type,
            "shares": shares,
            "price_per_share": effective_price,
            "total_amount": total_amount,
            "currency": stock_currency,
            "exchange_rate_to_czk": exchange_rate_to_czk,
            "total_amount_czk": total_amount_czk,
            "fees": 0,  # No separate fees for stock tx, fees on option tx
            "notes": tx_notes,
            "executed_at": close_date.isoformat(),
            "source_transaction_id": source_transaction_id if tx_type == "SELL" else None,
        }
        
        from app.services.portfolio import portfolio_service
        created = await portfolio_service.create_transaction_record(tx_data)

        logger.info(
            f"Created stock {tx_type} for option {closing_action}: "
            f"{shares} {symbol} @ ${effective_price} "
            f"(strike: ${strike_price}, transferred: ${transferred_entry_per_share})"
        )

        return created


# Singleton instance
options_service = OptionsService()
