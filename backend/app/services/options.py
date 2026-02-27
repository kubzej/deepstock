"""
Options Trading Service for DeepStock.
Handles CRUD operations for option transactions and holdings.
"""
import logging
from app.core.supabase import supabase
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import date, datetime
from decimal import Decimal

logger = logging.getLogger(__name__)


# ==========================================
# Pydantic Schemas
# ==========================================

OptionType = Literal["call", "put"]
OptionAction = Literal["BTO", "STC", "STO", "BTC", "EXPIRATION", "ASSIGNMENT", "EXERCISE"]


class OptionTransactionCreate(BaseModel):
    """Create a new option transaction."""
    symbol: str = Field(..., description="Underlying ticker (e.g., AAPL)")
    option_type: OptionType
    strike_price: float
    expiration_date: date
    action: OptionAction
    contracts: int = Field(..., gt=0)
    premium: Optional[float] = None  # Per share, can be None for EXPIRATION
    currency: str = "USD"
    exchange_rate_to_czk: Optional[float] = None
    fees: float = 0
    date: date
    notes: Optional[str] = None


class OptionTransactionUpdate(BaseModel):
    """Update an existing option transaction."""
    action: Optional[OptionAction] = None
    contracts: Optional[int] = Field(None, gt=0)
    premium: Optional[float] = None
    currency: Optional[str] = None
    exchange_rate_to_czk: Optional[float] = None
    fees: Optional[float] = None
    date: Optional[date] = None
    notes: Optional[str] = None


class OptionPriceUpdate(BaseModel):
    """Update option price and Greeks."""
    price: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    volume: Optional[int] = None
    open_interest: Optional[int] = None
    implied_volatility: Optional[float] = None
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None


class OptionCloseRequest(BaseModel):
    """Request to close an option position."""
    closing_action: OptionAction
    contracts: int = Field(..., gt=0)
    close_date: date
    premium: Optional[float] = None
    fees: float = 0
    exchange_rate_to_czk: Optional[float] = None
    notes: Optional[str] = None
    # For ASSIGNMENT (short call) or EXERCISE (long put) - need lot selection
    source_transaction_id: Optional[str] = None


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


# ==========================================
# Options Service
# ==========================================

class OptionsService:
    """Service for managing option transactions."""
    
    # ==========================================
    # Transactions CRUD
    # ==========================================
    
    async def get_transactions(
        self, 
        user_id: str,
        portfolio_id: Optional[str] = None,
        symbol: Optional[str] = None,
        option_symbol: Optional[str] = None,
        limit: int = 100
    ) -> List[dict]:
        """
        Get option transactions for a user.
        Optionally filter by portfolio_id, underlying symbol, or OCC option_symbol.
        """
        # First get user's portfolio IDs
        portfolios_response = supabase.table("portfolios") \
            .select("id") \
            .eq("user_id", user_id) \
            .execute()
        
        user_portfolio_ids = [p["id"] for p in portfolios_response.data]
        
        if not user_portfolio_ids:
            return []
        
        query = supabase.table("option_transactions") \
            .select("*, portfolios(name)") \
            .in_("portfolio_id", user_portfolio_ids) \
            .order("date", desc=True) \
            .limit(limit)
        
        if portfolio_id:
            # Additional filter if specific portfolio requested
            if portfolio_id not in user_portfolio_ids:
                return []  # User doesn't own this portfolio
            query = query.eq("portfolio_id", portfolio_id)
        
        if symbol:
            query = query.eq("symbol", symbol.upper())
        
        if option_symbol:
            query = query.eq("option_symbol", option_symbol)
        
        response = query.execute()
        
        # Add portfolio_name to each transaction
        result = []
        for tx in response.data:
            tx["portfolio_name"] = tx.get("portfolios", {}).get("name", "") if tx.get("portfolios") else ""
            del tx["portfolios"]  # Remove nested object
            result.append(tx)
        
        return result
    
    async def get_transaction_by_id(self, transaction_id: str) -> Optional[dict]:
        """Get a single transaction by ID."""
        response = supabase.table("option_transactions") \
            .select("*") \
            .eq("id", transaction_id) \
            .single() \
            .execute()
        return response.data
    
    async def create_transaction(
        self, 
        portfolio_id: str, 
        data: OptionTransactionCreate
    ) -> dict:
        """
        Create a new option transaction.
        Automatically generates OCC symbol.
        """
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
        
        return response.data[0]
    
    async def update_transaction(
        self, 
        transaction_id: str, 
        data: OptionTransactionUpdate
    ) -> Optional[dict]:
        """Update an existing option transaction."""
        # Build update dict with only provided fields
        update_data = {}
        
        if data.action is not None:
            update_data["action"] = data.action
        if data.contracts is not None:
            update_data["contracts"] = data.contracts
        if data.premium is not None:
            update_data["premium"] = data.premium
        if data.currency is not None:
            update_data["currency"] = data.currency
        if data.exchange_rate_to_czk is not None:
            update_data["exchange_rate_to_czk"] = data.exchange_rate_to_czk
        if data.fees is not None:
            update_data["fees"] = data.fees
        if data.date is not None:
            update_data["date"] = data.date.isoformat()
        if data.notes is not None:
            update_data["notes"] = data.notes
        
        if not update_data:
            # Nothing to update
            return await self.get_transaction_by_id(transaction_id)
        
        response = supabase.table("option_transactions") \
            .update(update_data) \
            .eq("id", transaction_id) \
            .execute()
        
        return response.data[0] if response.data else None
    
    async def delete_transaction(self, transaction_id: str) -> bool:
        """Delete an option transaction."""
        response = supabase.table("option_transactions") \
            .delete() \
            .eq("id", transaction_id) \
            .execute()
        
        return len(response.data) > 0
    
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
        return response.data
    
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
        
        return response.data
    
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
    
    def _fetch_option_prices_batch(self, option_symbols: List[str]) -> List[dict]:
        """
        Fetch multiple option prices using yf.Tickers batch object.
        This shares the HTTP session across all tickers for better performance.
        """
        import yfinance as yf
        
        results = []
        
        if not option_symbols:
            return results
        
        try:
            # Create batch ticker object - shares HTTP session
            batch = yf.Tickers(" ".join(option_symbols))
            
            for occ_symbol in option_symbols:
                try:
                    ticker_obj = batch.tickers.get(occ_symbol)
                    if not ticker_obj:
                        continue
                    
                    info = ticker_obj.info
                    
                    if not info or info.get("regularMarketPrice") is None:
                        continue
                    
                    results.append({
                        "option_symbol": occ_symbol,
                        "price": info.get("regularMarketPrice"),
                        "bid": info.get("bid"),
                        "ask": info.get("ask"),
                        "volume": info.get("volume"),
                        "open_interest": info.get("openInterest"),
                        "implied_volatility": info.get("impliedVolatility"),
                        "updated_at": datetime.utcnow().isoformat(),
                    })
                    
                except Exception as e:
                    logger.warning(f"Failed to fetch price for {occ_symbol}: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Error creating batch tickers: {e}")
        
        return results

    async def fetch_live_prices(self, option_symbols: List[str]) -> List[dict]:
        """
        Fetch live option prices from Yahoo Finance via yfinance.
        Updates the option_prices cache and returns the results.
        
        Optimization: Uses yf.Tickers batch object for shared HTTP session.
        """
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        
        if not option_symbols:
            return []
        
        # Batch fetch using shared session in thread pool
        loop = asyncio.get_event_loop()
        
        with ThreadPoolExecutor(max_workers=1) as executor:
            fetched_results = await loop.run_in_executor(
                executor, 
                self._fetch_option_prices_batch, 
                option_symbols
            )
        
        # Upsert to cache
        results = []
        for result in fetched_results:
            try:
                supabase.table("option_prices") \
                    .upsert(result, on_conflict="option_symbol") \
                    .execute()
                results.append(result)
            except Exception as e:
                logger.warning(f"Failed to upsert price: {e}")
        
        return results
    
    async def upsert_price(
        self, 
        option_symbol: str, 
        data: OptionPriceUpdate
    ) -> dict:
        """Update or insert option price and Greeks."""
        upsert_data = {
            "option_symbol": option_symbol,
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        if data.price is not None:
            upsert_data["price"] = data.price
        if data.bid is not None:
            upsert_data["bid"] = data.bid
        if data.ask is not None:
            upsert_data["ask"] = data.ask
        if data.volume is not None:
            upsert_data["volume"] = data.volume
        if data.open_interest is not None:
            upsert_data["open_interest"] = data.open_interest
        if data.implied_volatility is not None:
            upsert_data["implied_volatility"] = data.implied_volatility
        if data.delta is not None:
            upsert_data["delta"] = data.delta
        if data.gamma is not None:
            upsert_data["gamma"] = data.gamma
        if data.theta is not None:
            upsert_data["theta"] = data.theta
        if data.vega is not None:
            upsert_data["vega"] = data.vega
        
        response = supabase.table("option_prices") \
            .upsert(upsert_data, on_conflict="option_symbol") \
            .execute()
        
        return response.data[0]
    
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
        source_transaction_id: Optional[str] = None
    ) -> dict:
        """
        Close an existing option position.
        
        For ASSIGNMENT/EXERCISE, creates a linked stock transaction:
        - Short PUT -> ASSIGNMENT: BUY shares at strike
        - Short CALL -> ASSIGNMENT: SELL shares at strike (requires source_transaction_id)
        - Long CALL -> EXERCISE: BUY shares at strike
        - Long PUT -> EXERCISE: SELL shares at strike (requires source_transaction_id)
        """
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
        
        # Get original avg_premium for P/L calculation
        avg_premium = float(holding.get("avg_premium") or 0)
        closing_premium = float(premium) if premium else 0
        
        # Calculate realized P/L (IBKR style - P/L only at close)
        # For BTC/STC: difference between open and close premium
        # For EXPIRATION: full premium (profit for short, loss for long)
        # For ASSIGNMENT/EXERCISE: 0 (premium transferred to stock cost basis)
        realized_pl = 0.0
        
        if closing_action == "BTC":
            # Short position close: we received avg_premium, now pay closing_premium
            realized_pl = (avg_premium - closing_premium) * contracts * 100
        elif closing_action == "STC":
            # Long position close: we paid avg_premium, now receive closing_premium
            realized_pl = (closing_premium - avg_premium) * contracts * 100
        elif closing_action == "EXPIRATION":
            if position == "short":
                # Short position expired: we keep the full premium
                realized_pl = avg_premium * contracts * 100
            else:
                # Long position expired: we lose the full premium
                realized_pl = -avg_premium * contracts * 100
        elif closing_action in ["ASSIGNMENT", "EXERCISE"]:
            # Premium is transferred to stock cost basis, option P/L = 0
            realized_pl = 0
        
        # Determine if we need a stock transaction
        linked_stock_tx_id = None
        
        if closing_action in ["ASSIGNMENT", "EXERCISE"]:
            stock_tx = await self._create_stock_transaction_for_option_close(
                portfolio_id=portfolio_id,
                holding=holding,
                closing_action=closing_action,
                contracts=contracts,
                close_date=close_date,
                exchange_rate_to_czk=exchange_rate_to_czk,
                source_transaction_id=source_transaction_id,
                notes=notes,
            )
            linked_stock_tx_id = stock_tx["id"]
        
        # Create option closing transaction
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
            "total_premium": realized_pl,  # Store realized P/L here for performance calculation
            "currency": "USD",
            "exchange_rate_to_czk": exchange_rate_to_czk,
            "fees": fees,
            "date": close_date.isoformat(),
            "notes": notes,
            "linked_stock_tx_id": linked_stock_tx_id,
        }
        
        response = supabase.table("option_transactions") \
            .insert(insert_data) \
            .execute()
        
        logger.info(
            f"Closed option position {option_symbol_value} with {closing_action}: "
            f"realized P/L = ${realized_pl:.2f}"
        )
        
        return response.data[0]
    
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
    ) -> dict:
        """
        Create a stock transaction when an option is assigned/exercised.
        
        For SHORT positions (ASSIGNMENT), the received premium affects the effective price:
        - Short PUT -> ASSIGNMENT: BUY at (strike - avg_premium) = lower cost basis
        - Short CALL -> ASSIGNMENT: SELL at (strike + avg_premium) = higher effective sale price
        
        For LONG positions (EXERCISE), premium is a separate sunk cost:
        - Long CALL -> EXERCISE: BUY at strike price
        - Long PUT -> EXERCISE: SELL at strike price
        """
        from app.services.stocks import stock_service
        
        position = holding["position"]
        option_type = holding["option_type"]
        strike_price = float(holding["strike_price"])
        avg_premium = float(holding.get("avg_premium") or 0)
        symbol = holding["symbol"]
        shares = contracts * 100
        
        # Determine transaction type
        # ASSIGNMENT: short put -> BUY, short call -> SELL
        # EXERCISE: long call -> BUY, long put -> SELL
        if closing_action == "ASSIGNMENT":
            tx_type = "BUY" if option_type == "put" else "SELL"
        else:  # EXERCISE
            tx_type = "BUY" if option_type == "call" else "SELL"
        
        # Calculate effective price per share
        # Only adjust for SHORT positions (ASSIGNMENT) where we received premium
        if closing_action == "ASSIGNMENT" and position == "short":
            if tx_type == "BUY":
                # Short PUT assigned: we buy at strike, but received premium lowers cost
                effective_price = strike_price - avg_premium
            else:
                # Short CALL assigned: we sell at strike, but received premium increases effective sale
                effective_price = strike_price + avg_premium
        else:
            # EXERCISE (long positions): premium was paid separately, use strike
            effective_price = strike_price
        
        # For SELL transactions, we need source_transaction_id
        if tx_type == "SELL" and not source_transaction_id:
            raise ValueError(
                f"Pro {closing_action} {option_type} opce je nutné vybrat lot akcií k prodeji"
            )
        
        # Get or create stock
        stock = await stock_service.get_or_create(symbol)
        
        # Calculate totals
        total_amount = shares * effective_price
        total_amount_czk = total_amount * exchange_rate_to_czk if exchange_rate_to_czk else None
        
        # Build note with details about the adjustment
        if closing_action == "ASSIGNMENT" and avg_premium > 0:
            tx_notes = f"{closing_action} from {holding['option_symbol']} (strike ${strike_price}, premium ${avg_premium})"
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
            "currency": "USD",
            "exchange_rate_to_czk": exchange_rate_to_czk,
            "total_amount_czk": total_amount_czk,
            "fees": 0,  # No separate fees for stock tx, fees on option tx
            "notes": tx_notes,
            "executed_at": close_date.isoformat(),
            "source_transaction_id": source_transaction_id if tx_type == "SELL" else None,
        }
        
        response = supabase.table("transactions") \
            .insert(tx_data) \
            .execute()
        
        logger.info(
            f"Created stock {tx_type} for option {closing_action}: "
            f"{shares} {symbol} @ ${effective_price} (strike: ${strike_price}, premium: ${avg_premium})"
        )
        
        # Recalculate holding to update shares/avg_cost
        from app.services.portfolio import portfolio_service
        await portfolio_service._recalculate_holding(portfolio_id, stock["id"])
        
        return response.data[0]


# Singleton instance
options_service = OptionsService()
