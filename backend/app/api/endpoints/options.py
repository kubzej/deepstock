"""
Options API Endpoints for DeepStock.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from app.services.options import (
    options_service, 
    OptionTransactionCreate, 
    OptionTransactionUpdate,
    OptionPriceUpdate,
    OptionAction,
)
from app.core.auth import get_current_user_id
from typing import Optional, List
from datetime import date

router = APIRouter()


# ==========================================
# Holdings (open positions)
# ==========================================

@router.get("/holdings")
async def get_all_option_holdings(user_id: str = Depends(get_current_user_id)):
    """
    Get all option holdings across all user's portfolios.
    Returns open positions with Greeks, moneyness, and buffer.
    """
    return await options_service.get_all_holdings_for_user(user_id)


@router.get("/holdings/{portfolio_id}")
async def get_portfolio_option_holdings(portfolio_id: str):
    """Get option holdings for a specific portfolio."""
    return await options_service.get_holdings(portfolio_id)


@router.get("/stats")
async def get_option_stats(
    portfolio_id: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id)
):
    """
    Get summary statistics for option holdings.
    If portfolio_id is provided, returns stats for that portfolio only.
    """
    return await options_service.get_stats(portfolio_id)


# ==========================================
# Transactions CRUD
# ==========================================

@router.get("/transactions")
async def get_option_transactions(
    portfolio_id: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    option_symbol: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    user_id: str = Depends(get_current_user_id)
):
    """
    Get option transactions for authenticated user.
    Optionally filter by portfolio_id, underlying symbol, or OCC option_symbol.
    """
    return await options_service.get_transactions(user_id, portfolio_id, symbol, option_symbol, limit)


@router.get("/transactions/{transaction_id}")
async def get_option_transaction(transaction_id: str):
    """Get a single option transaction by ID."""
    tx = await options_service.get_transaction_by_id(transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transakce nenalezena")
    return tx


@router.post("/transactions/{portfolio_id}")
async def create_option_transaction(
    portfolio_id: str,
    data: OptionTransactionCreate,
    user_id: str = Depends(get_current_user_id)
):
    """
    Create a new option transaction.
    
    Actions:
    - BTO: Buy to Open (create long position)
    - STC: Sell to Close (close long position)
    - STO: Sell to Open (create short position)
    - BTC: Buy to Close (close short position)
    - EXPIRATION: Option expired worthless
    - ASSIGNMENT: Short option was assigned
    - EXERCISE: Long option was exercised
    """
    return await options_service.create_transaction(portfolio_id, data)


@router.put("/transactions/{transaction_id}")
async def update_option_transaction(
    transaction_id: str,
    data: OptionTransactionUpdate,
    user_id: str = Depends(get_current_user_id)
):
    """Update an existing option transaction."""
    result = await options_service.update_transaction(transaction_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Transakce nenalezena")
    return result


@router.delete("/transactions/{transaction_id}")
async def delete_option_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete an option transaction."""
    success = await options_service.delete_transaction(transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transakce nenalezena")
    return {"success": True}


@router.delete("/transactions/by-symbol/{option_symbol}")
async def delete_option_transactions_by_symbol(
    option_symbol: str,
    portfolio_id: str = Query(...),
    user_id: str = Depends(get_current_user_id)
):
    """Delete all transactions for a specific option position."""
    count = await options_service.delete_transactions_by_symbol(portfolio_id, option_symbol)
    return {"success": True, "deleted_count": count}


# ==========================================
# Close Position (convenience endpoint)
# ==========================================

class ClosePositionRequest(OptionTransactionUpdate):
    """Request to close an existing position."""
    option_symbol: str
    closing_action: OptionAction
    contracts: int
    premium: Optional[float] = None
    close_date: date
    fees: float = 0
    exchange_rate_to_czk: Optional[float] = None
    notes: Optional[str] = None


@router.post("/{portfolio_id}/close")
async def close_option_position(
    portfolio_id: str,
    option_symbol: str,
    closing_action: OptionAction,
    contracts: int,
    close_date: date,
    premium: Optional[float] = None,
    fees: float = 0,
    exchange_rate_to_czk: Optional[float] = None,
    notes: Optional[str] = None,
    source_transaction_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Close an existing option position.
    
    Validates that:
    - Position exists
    - Closing action is valid for position type
    - Contracts don't exceed open quantity
    
    For long positions: use STC, EXPIRATION, or EXERCISE
    For short positions: use BTC, EXPIRATION, or ASSIGNMENT
    
    For ASSIGNMENT (short call) or EXERCISE (long put), provide source_transaction_id
    to specify which stock lot to sell.
    """
    try:
        return await options_service.close_position(
            portfolio_id=portfolio_id,
            option_symbol=option_symbol,
            closing_action=closing_action,
            contracts=contracts,
            premium=premium,
            close_date=close_date,
            fees=fees,
            exchange_rate_to_czk=exchange_rate_to_czk,
            notes=notes,
            source_transaction_id=source_transaction_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Prices
# ==========================================

@router.get("/prices")
async def get_option_prices(
    symbols: str = Query(..., description="Comma-separated OCC symbols")
):
    """
    Get cached prices for option symbols.
    Symbols should be in OCC format (e.g., AAPL250117C00150000).
    """
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    return await options_service.get_prices(symbol_list)


@router.post("/prices/refresh")
async def refresh_option_prices(
    portfolio_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Refresh option prices from Yahoo Finance for all holdings.
    Fetches live prices using yfinance and updates the cache.
    """
    # Get holdings to know which symbols to refresh
    holdings = await options_service.get_holdings(portfolio_id)
    
    if not holdings:
        return {"updated": 0, "message": "No holdings to refresh"}
    
    # Extract unique option symbols
    option_symbols = list(set(h["option_symbol"] for h in holdings if h.get("option_symbol")))
    
    # Fetch live prices
    results = await options_service.fetch_live_prices(option_symbols)
    
    return {
        "updated": len(results),
        "total": len(option_symbols),
        "failed": len(option_symbols) - len(results),
    }


@router.post("/prices/{option_symbol}")
async def update_option_price(
    option_symbol: str,
    data: OptionPriceUpdate,
    user_id: str = Depends(get_current_user_id)
):
    """
    Update or insert option price and Greeks.
    Typically called by a background job fetching from yfinance.
    """
    return await options_service.upsert_price(option_symbol, data)


# ==========================================
# Batch Price Update (for background jobs)
# ==========================================

class BatchPriceUpdate(OptionPriceUpdate):
    option_symbol: str


@router.post("/prices/batch")
async def batch_update_prices(
    prices: List[BatchPriceUpdate],
    user_id: str = Depends(get_current_user_id)
):
    """
    Batch update option prices and Greeks.
    Used by background jobs to update multiple options at once.
    """
    results = []
    for price_data in prices:
        option_symbol = price_data.option_symbol
        update_data = OptionPriceUpdate(
            price=price_data.price,
            bid=price_data.bid,
            ask=price_data.ask,
            volume=price_data.volume,
            open_interest=price_data.open_interest,
            implied_volatility=price_data.implied_volatility,
            delta=price_data.delta,
            gamma=price_data.gamma,
            theta=price_data.theta,
            vega=price_data.vega,
        )
        result = await options_service.upsert_price(option_symbol, update_data)
        results.append(result)
    
    return {"updated": len(results), "results": results}
