"""API request and response models for stocks."""
from typing import Optional
from pydantic import BaseModel


class StockCreate(BaseModel):
    ticker: str
    name: str
    currency: str = "USD"
    sector: Optional[str] = None
    industry: Optional[str] = None
    exchange: Optional[str] = None
    country: Optional[str] = None
    price_scale: float = 1.0
    notes: Optional[str] = None


class StockUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    exchange: Optional[str] = None
    country: Optional[str] = None
    price_scale: Optional[float] = None
    notes: Optional[str] = None
