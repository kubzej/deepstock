"""API request and response models for ai stock metadata."""
from typing import Optional
from pydantic import BaseModel


class StockMetadataRequest(BaseModel):
    ticker: str


class StockMetadataResponse(BaseModel):
    ticker: str
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    country: Optional[str] = None
    price_scale: Optional[float] = None
    notes: Optional[str] = None
    cached: bool = False
    used_ai: bool = False
