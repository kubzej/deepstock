"""
Options Trading Service for DeepStock.
Handles CRUD operations for option transactions and holdings.
"""
from app.core.supabase import supabase
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import date, datetime
from decimal import Decimal


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
        portfolio_id: Optional[str] = None,
        symbol: Optional[str] = None,
        option_symbol: Optional[str] = None,
        limit: int = 100
    ) -> List[dict]:
        """
        Get option transactions.
        Optionally filter by portfolio_id, underlying symbol, or OCC option_symbol.
        """
        query = supabase.table("option_transactions") \
            .select("*") \
            .order("date", desc=True) \
            .limit(limit)
        
        if portfolio_id:
            query = query.eq("portfolio_id", portfolio_id)
        
        if symbol:
            query = query.eq("symbol", symbol.upper())
        
        if option_symbol:
            query = query.eq("option_symbol", option_symbol)
        
        response = query.execute()
        return response.data
    
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
    
    async def fetch_live_prices(self, option_symbols: List[str]) -> List[dict]:
        """
        Fetch live option prices from Yahoo Finance via yfinance.
        Updates the option_prices cache and returns the results.
        """
        import yfinance as yf
        
        results = []
        for occ_symbol in option_symbols:
            try:
                # yfinance accepts OCC symbols directly
                ticker = yf.Ticker(occ_symbol)
                info = ticker.info
                
                if not info or info.get("regularMarketPrice") is None:
                    continue
                
                price_data = {
                    "option_symbol": occ_symbol,
                    "price": info.get("regularMarketPrice"),
                    "bid": info.get("bid"),
                    "ask": info.get("ask"),
                    "volume": info.get("volume"),
                    "open_interest": info.get("openInterest"),
                    "implied_volatility": info.get("impliedVolatility"),
                    "updated_at": datetime.utcnow().isoformat(),
                }
                
                # Upsert to cache
                supabase.table("option_prices") \
                    .upsert(price_data, on_conflict="option_symbol") \
                    .execute()
                
                results.append(price_data)
                
            except Exception as e:
                print(f"Failed to fetch price for {occ_symbol}: {e}")
                continue
        
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
        
        today = date.today()
        week_from_now = date.today()
        
        # Calculate days to add for a week
        from datetime import timedelta
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
        notes: Optional[str] = None
    ) -> dict:
        """
        Helper to close an existing position.
        Validates that closing action matches position type.
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
        
        # Create closing transaction
        create_data = OptionTransactionCreate(
            symbol=holding["symbol"],
            option_type=holding["option_type"],
            strike_price=float(holding["strike_price"]),
            expiration_date=date.fromisoformat(holding["expiration_date"]),
            action=closing_action,
            contracts=contracts,
            premium=premium,
            currency="USD",
            exchange_rate_to_czk=exchange_rate_to_czk,
            fees=fees,
            date=close_date,
            notes=notes,
        )
        
        return await self.create_transaction(portfolio_id, create_data)


# Singleton instance
options_service = OptionsService()
