from fastapi import APIRouter, HTTPException, Depends
from app.services.portfolio import portfolio_service, PortfolioCreate, PortfolioUpdate, TransactionCreate, TransactionUpdate, AvailableLot
from app.services.performance import get_stock_performance, get_options_performance
from app.core.auth import get_current_user_id
from typing import List, Optional

router = APIRouter()


@router.get("/")
async def get_portfolios(user_id: str = Depends(get_current_user_id)):
    """Get all portfolios for authenticated user."""
    return await portfolio_service.get_user_portfolios(user_id)


@router.post("/")
async def create_portfolio(data: PortfolioCreate, user_id: str = Depends(get_current_user_id)):
    """Create a new portfolio for authenticated user."""
    return await portfolio_service.create_portfolio(user_id, data)


# ============ "All portfolios" endpoints - MUST be before /{portfolio_id}/* routes ============

@router.get("/all/holdings")
async def get_all_holdings(user_id: str = Depends(get_current_user_id)):
    """Get all holdings across all user's portfolios."""
    return await portfolio_service.get_all_holdings(user_id)


@router.get("/all/transactions")
async def get_all_transactions(user_id: str = Depends(get_current_user_id), limit: int = 100):
    """Get transactions across all user's portfolios."""
    return await portfolio_service.get_all_transactions(user_id, limit)


@router.get("/all/open-lots")
async def get_all_open_lots_for_user(user_id: str = Depends(get_current_user_id)):
    """Get all open lots across all user's portfolios."""
    return await portfolio_service.get_all_open_lots_for_user(user_id)


@router.post("/admin/recalculate-all")
async def recalculate_all_portfolios(user_id: str = Depends(get_current_user_id)):
    """
    Recalculate all holdings across ALL portfolios.
    One-time use after migration. Requires authentication.
    """
    return await portfolio_service.recalculate_all_portfolios()


# ============ Single portfolio endpoints ============

@router.put("/{portfolio_id}")
async def update_portfolio(
    portfolio_id: str, 
    data: PortfolioUpdate, 
    user_id: str = Depends(get_current_user_id)
):
    """Update a portfolio."""
    result = await portfolio_service.update_portfolio(portfolio_id, user_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return result


@router.delete("/{portfolio_id}")
async def delete_portfolio(
    portfolio_id: str, 
    user_id: str = Depends(get_current_user_id)
):
    """Delete a portfolio and all related data."""
    success = await portfolio_service.delete_portfolio(portfolio_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return {"success": True}


@router.get("/{portfolio_id}/holdings")
async def get_holdings(portfolio_id: str):
    """Get all holdings in a portfolio."""
    return await portfolio_service.get_holdings(portfolio_id)


@router.get("/{portfolio_id}/transactions")
async def get_transactions(portfolio_id: str, limit: int = 50):
    """Get recent transactions for a portfolio."""
    return await portfolio_service.get_transactions(portfolio_id, limit)


@router.post("/{portfolio_id}/transactions")
async def add_transaction(portfolio_id: str, data: TransactionCreate):
    """
    Add a new transaction (BUY or SELL).
    Automatically updates holdings with FIFO cost basis.
    For SELL: use source_transaction_id to sell from a specific lot.
    """
    return await portfolio_service.add_transaction(portfolio_id, data)


@router.get("/{portfolio_id}/open-lots")
async def get_all_open_lots(portfolio_id: str):
    """
    Get all open lots across all holdings in the portfolio.
    Returns BUY transactions with remaining shares, enriched with stock info.
    """
    return await portfolio_service.get_all_open_lots(portfolio_id)


@router.get("/{portfolio_id}/available-lots/{stock_ticker}", response_model=List[AvailableLot])
async def get_available_lots(portfolio_id: str, stock_ticker: str):
    """
    Get available lots for selling a specific stock.
    Returns BUY transactions with remaining shares not yet sold.
    """
    return await portfolio_service.get_available_lots(portfolio_id, stock_ticker)


@router.post("/{portfolio_id}/recalculate")
async def recalculate_holdings(portfolio_id: str):
    """
    Recalculate all holdings for a portfolio.
    Use this after migration to populate total_invested_czk.
    """
    return await portfolio_service.recalculate_all_holdings(portfolio_id)


@router.put("/{portfolio_id}/transactions/{transaction_id}")
async def update_transaction(
    portfolio_id: str,
    transaction_id: str,
    data: TransactionUpdate
):
    """
    Update an existing transaction.
    Only certain fields can be updated: shares, price, currency, fees, notes, date.
    """
    try:
        result = await portfolio_service.update_transaction(portfolio_id, transaction_id, data)
        if not result:
            raise HTTPException(status_code=404, detail="Transakce nenalezena")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{portfolio_id}/transactions/{transaction_id}")
async def delete_transaction(portfolio_id: str, transaction_id: str):
    """
    Delete a transaction.
    Warning: Cannot delete a BUY if shares from it have been sold.
    """
    try:
        success = await portfolio_service.delete_transaction(portfolio_id, transaction_id)
        if not success:
            raise HTTPException(status_code=404, detail="Transakce nenalezena")
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============ Performance endpoints ============

@router.get("/all/performance/stocks")
async def get_all_stock_performance(
    period: str = "1Y",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get stock portfolio performance over time for all portfolios.
    Period: 1W, 1M, 3M, 6M, MTD, YTD, 1Y, ALL
    Or use from_date/to_date for custom range (YYYY-MM-DD format)
    """
    return await get_stock_performance(user_id, portfolio_id=None, period=period, from_date=from_date, to_date=to_date)


@router.get("/all/performance/options")
async def get_all_options_performance(
    period: str = "1Y",
    user_id: str = Depends(get_current_user_id)
):
    """
    Get options P/L performance over time for all portfolios.
    Period: 1W, 1M, 3M, 6M, MTD, YTD, 1Y, ALL
    """
    return await get_options_performance(user_id, portfolio_id=None, period=period)


@router.get("/{portfolio_id}/performance/stocks")
async def get_portfolio_stock_performance(
    portfolio_id: str,
    period: str = "1Y",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get stock portfolio performance over time for a specific portfolio.
    """
    return await get_stock_performance(user_id, portfolio_id=portfolio_id, period=period, from_date=from_date, to_date=to_date)


@router.get("/{portfolio_id}/performance/options")
async def get_portfolio_options_performance(
    portfolio_id: str,
    period: str = "1Y",
    user_id: str = Depends(get_current_user_id)
):
    """
    Get options P/L performance over time for a specific portfolio.
    """
    return await get_options_performance(user_id, portfolio_id=portfolio_id, period=period)
