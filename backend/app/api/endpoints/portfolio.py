from fastapi import APIRouter, HTTPException
from app.services.portfolio import portfolio_service, PortfolioCreate, TransactionCreate
from typing import List

router = APIRouter()


@router.get("/{user_id}")
async def get_portfolios(user_id: str):
    """Get all portfolios for a user."""
    return await portfolio_service.get_user_portfolios(user_id)


@router.post("/{user_id}")
async def create_portfolio(user_id: str, data: PortfolioCreate):
    """Create a new portfolio."""
    return await portfolio_service.create_portfolio(user_id, data)


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
    """
    return await portfolio_service.add_transaction(portfolio_id, data)
