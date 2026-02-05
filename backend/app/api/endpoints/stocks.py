"""
Stocks API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from app.services.stocks import stock_service, StockCreate, StockUpdate
from app.core.auth import get_current_user_id

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/")
async def list_stocks(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """Get all stocks with pagination."""
    return await stock_service.get_all(limit=limit, offset=offset)


@router.get("/search")
async def search_stocks(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """Search stocks by ticker or name."""
    return await stock_service.search(query=q, limit=limit)


@router.get("/{ticker}")
async def get_stock(
    ticker: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Get stock by ticker."""
    stock = await stock_service.get_by_ticker(ticker)
    if not stock:
        raise HTTPException(status_code=404, detail="Akcie nenalezena")
    return stock


@router.post("/")
async def create_stock(
    data: StockCreate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Create a new stock."""
    try:
        return await stock_service.create(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{stock_id}")
async def update_stock(
    stock_id: str,
    data: StockUpdate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Update stock details."""
    stock = await stock_service.update(stock_id, data)
    if not stock:
        raise HTTPException(status_code=404, detail="Akcie nenalezena")
    return stock


@router.delete("/{stock_id}")
async def delete_stock(
    stock_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Delete a stock. Fails if stock has holdings/transactions."""
    success = await stock_service.delete(stock_id)
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="Nelze smazat akcii s existujícími transakcemi"
        )
    return {"success": True}
