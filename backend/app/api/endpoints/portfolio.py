from fastapi import APIRouter, HTTPException, Depends
from app.services.portfolio import portfolio_service, PortfolioCreate, PortfolioUpdate, TransactionCreate, AvailableLot
from app.core.auth import get_current_user_id
from typing import List

router = APIRouter()


@router.get("/")
async def get_portfolios(user_id: str = Depends(get_current_user_id)):
    """Get all portfolios for authenticated user."""
    return await portfolio_service.get_user_portfolios(user_id)


@router.post("/")
async def create_portfolio(data: PortfolioCreate, user_id: str = Depends(get_current_user_id)):
    """Create a new portfolio for authenticated user."""
    return await portfolio_service.create_portfolio(user_id, data)


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


@router.post("/admin/recalculate-all")
async def recalculate_all_portfolios():
    """
    Recalculate all holdings across ALL portfolios.
    One-time use after migration.
    """
    return await portfolio_service.recalculate_all_portfolios()
