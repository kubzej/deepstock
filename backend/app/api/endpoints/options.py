"""
Options API Endpoints for DeepStock.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from app.services.options import options_service
from app.services.portfolio import portfolio_service
from app.services.journal import journal_service
from app.core.auth import get_current_user_id
from app.core.redis import get_redis
from typing import Optional
from datetime import date, datetime, timedelta
from app.schemas.options import OptionAction, OptionTransactionCreate

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
async def get_portfolio_option_holdings(portfolio_id: str, user_id: str = Depends(get_current_user_id)):
    """Get option holdings for a specific portfolio."""
    if not await portfolio_service.verify_portfolio_ownership(portfolio_id, user_id):
        raise HTTPException(status_code=404, detail="Portfolio nenalezeno")
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
    if portfolio_id:
        if not await portfolio_service.verify_portfolio_ownership(portfolio_id, user_id):
            raise HTTPException(status_code=404, detail="Portfolio nenalezeno")
        return await options_service.get_stats(portfolio_id)

    holdings = await options_service.get_all_holdings_for_user(user_id)
    today = date.today()
    week_from_now = today + timedelta(days=7)
    return {
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


# ==========================================
# Transactions CRUD
# ==========================================

@router.get("/transactions")
async def get_option_transactions(
    portfolio_id: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    option_symbol: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    cursor: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id)
):
    """
    Get option transactions for authenticated user, newest first.
    Optionally filter by portfolio_id, underlying symbol, or OCC option_symbol.
    Pass the previous response's next_cursor as cursor to load older pages.
    """
    try:
        return await options_service.get_transactions_page(
            user_id, portfolio_id, symbol, option_symbol, limit, cursor
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/transactions/{portfolio_id}")
async def create_option_transaction(
    portfolio_id: str,
    data: OptionTransactionCreate,
    user_id: str = Depends(get_current_user_id)
):
    """
    Open an option position.

    Actions:
    - BTO: Buy to Open (create long position)
    - STO: Sell to Open (create short position)

    Closing actions go through POST /{portfolio_id}/close, which checks the open
    position and settles the stock side of assignment/exercise.
    """
    if not await portfolio_service.verify_portfolio_ownership(portfolio_id, user_id):
        raise HTTPException(status_code=404, detail="Portfolio nenalezeno")
    try:
        tx = await options_service.create_transaction(portfolio_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    created_at = datetime.fromisoformat(tx["created_at"]) if isinstance(tx["created_at"], str) else tx["created_at"]
    await journal_service.create_option_journal_entry(
        ticker=data.symbol,
        option_transaction_id=tx["id"],
        portfolio_id=portfolio_id,
        user_id=user_id,
        action=tx["action"],
        option_type=tx["option_type"],
        strike=tx["strike_price"],
        expiration=data.expiration_date,
        contracts=tx["contracts"],
        premium=tx.get("premium"),
        option_symbol=tx["option_symbol"],
        notes=data.notes,
        created_at=created_at,
    )
    return tx


@router.delete("/transactions/by-symbol/{option_symbol}")
async def delete_option_transactions_by_symbol(
    option_symbol: str,
    portfolio_id: str = Query(...),
    user_id: str = Depends(get_current_user_id)
):
    """Delete all transactions for a specific option position."""
    if not await portfolio_service.verify_portfolio_ownership(portfolio_id, user_id):
        raise HTTPException(status_code=404, detail="Portfolio nenalezeno")
    count = await options_service.delete_transactions_by_symbol(portfolio_id, option_symbol)
    return {"success": True, "deleted_count": count}


# ==========================================
# Close Position (convenience endpoint)
# ==========================================


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
    if not await portfolio_service.verify_portfolio_ownership(portfolio_id, user_id):
        raise HTTPException(status_code=404, detail="Portfolio nenalezeno")
    try:
        tx, stock_tx = await options_service.close_position(
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
            user_id=user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Option journal entry (same pattern as create_option_transaction)
    created_at = datetime.fromisoformat(tx["created_at"]) if isinstance(tx["created_at"], str) else tx["created_at"]
    await journal_service.create_option_journal_entry(
        ticker=tx["symbol"],
        option_transaction_id=tx["id"],
        portfolio_id=portfolio_id,
        user_id=user_id,
        action=tx["action"],
        option_type=tx["option_type"],
        strike=float(tx["strike_price"]),
        expiration=date.fromisoformat(tx["expiration_date"]) if isinstance(tx["expiration_date"], str) else tx["expiration_date"],
        contracts=tx["contracts"],
        premium=tx.get("premium"),
        option_symbol=tx["option_symbol"],
        notes=notes,
        created_at=created_at,
    )

    # Stock transaction journal entry for EXERCISE/ASSIGNMENT (same pattern as portfolio.py add_transaction)
    if stock_tx:
        stock_executed_at = datetime.fromisoformat(stock_tx["executed_at"]) if isinstance(stock_tx["executed_at"], str) else stock_tx["executed_at"]
        await journal_service.create_transaction_journal_entry(
            ticker=tx["symbol"],
            transaction_id=stock_tx["id"],
            portfolio_id=portfolio_id,
            user_id=user_id,
            action=stock_tx["type"],
            shares=stock_tx["shares"],
            price=stock_tx["price_per_share"],
            currency=stock_tx["currency"],
            fees=stock_tx.get("fees") or 0,
            notes=stock_tx.get("notes"),
            executed_at=stock_executed_at,
        )

    return tx


# ==========================================
# Prices
# ==========================================

@router.get("/prices")
async def get_option_prices(
    symbols: str = Query(..., description="Comma-separated OCC symbols"),
    user_id: str = Depends(get_current_user_id)
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
    redis = get_redis()
    cooldown_key = f"option_refresh_cooldown:{user_id}"
    if await redis.get(cooldown_key):
        return {"updated": 0, "message": "Refresh byl nedávno proveden, zkuste za chvíli"}

    # Get holdings to know which symbols to refresh
    if portfolio_id:
        if not await portfolio_service.verify_portfolio_ownership(portfolio_id, user_id):
            raise HTTPException(status_code=404, detail="Portfolio nenalezeno")
        holdings = await options_service.get_holdings(portfolio_id)
    else:
        holdings = await options_service.get_all_holdings_for_user(user_id)
    
    if not holdings:
        return {"updated": 0, "message": "No holdings to refresh"}
    
    # Extract unique option symbols
    option_symbols = list(set(h["option_symbol"] for h in holdings if h.get("option_symbol")))
    
    # Fetch live prices
    results = await options_service.fetch_live_prices(option_symbols)

    await redis.set(cooldown_key, "1", ex=300)  # 5min cooldown

    return {
        "updated": len(results),
        "total": len(option_symbols),
        "failed": len(option_symbols) - len(results),
    }

