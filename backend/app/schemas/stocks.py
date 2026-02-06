"""
Stock Response Schemas

Pydantic models for stock-related API responses.
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class StockResponse(BaseModel):
    """Stock entity (master data) response."""
    id: str
    ticker: str
    name: str
    sector: Optional[str] = None
    exchange: Optional[str] = None
    currency: str = "USD"
    notes: Optional[str] = None
    price_scale: int = 2
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class StockCreateRequest(BaseModel):
    """Request body for creating a stock."""
    ticker: str
    name: str
    sector: Optional[str] = None
    exchange: Optional[str] = None
    currency: str = "USD"
    notes: Optional[str] = None
    price_scale: int = 2


class StockUpdateRequest(BaseModel):
    """Request body for updating a stock."""
    ticker: Optional[str] = None
    name: Optional[str] = None
    sector: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    price_scale: Optional[int] = None
