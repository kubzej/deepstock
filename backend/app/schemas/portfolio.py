"""
Portfolio Response Schemas

Pydantic models for portfolio-related API responses.
These ensure consistent API contracts between backend and frontend.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PortfolioResponse(BaseModel):
    """Portfolio entity response."""
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class HoldingResponse(BaseModel):
    """Portfolio holding (aggregated position in a stock)."""
    ticker: str
    name: str
    shares: float
    avg_cost: float
    currency: str
    sector: Optional[str] = None
    price_scale: Optional[int] = None
    total_invested_czk: Optional[float] = None
    # Enriched fields (when calculated with current prices)
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    unrealized_pnl_pct: Optional[float] = None
    # For "All portfolios" view
    portfolio_id: Optional[str] = None
    portfolio_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class SourceTransactionResponse(BaseModel):
    """Source lot info for SELL transactions."""
    id: str
    executed_at: datetime
    price_per_share: float
    currency: str
    shares: float
    
    class Config:
        from_attributes = True


class StockEmbeddedResponse(BaseModel):
    """Embedded stock info in transaction response."""
    ticker: str
    name: str
    
    class Config:
        from_attributes = True


class TransactionResponse(BaseModel):
    """Transaction (BUY or SELL) response with embedded stock info."""
    id: str
    portfolio_id: str
    stock_id: str
    type: str  # 'BUY' or 'SELL'
    shares: float
    price_per_share: float
    total_amount: float
    total_amount_czk: float
    currency: str
    exchange_rate_to_czk: Optional[float] = None
    fees: Optional[float] = None
    executed_at: datetime
    notes: Optional[str] = None
    source_transaction_id: Optional[str] = None
    # Embedded relations
    stocks: StockEmbeddedResponse
    source_transaction: Optional[SourceTransactionResponse] = None
    # For "All portfolios" view
    portfolio_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class OpenLotResponse(BaseModel):
    """
    Open lot - a BUY transaction with remaining shares.
    Used for tax lot tracking and P/L calculations.
    """
    id: str
    ticker: str
    stock_name: str
    date: str  # Formatted date string
    shares: float  # Remaining shares
    buy_price: float = Field(alias="buyPrice")
    currency: str
    price_scale: Optional[int] = None
    portfolio_name: Optional[str] = None
    
    class Config:
        from_attributes = True
        populate_by_name = True


class AvailableLotResponse(BaseModel):
    """
    Available lot for selling - BUY with remaining shares.
    Used in lot picker when creating SELL transactions.
    """
    id: str
    date: str
    quantity: float  # Original quantity
    remaining_shares: float  # Shares not yet sold
    price_per_share: float
    currency: str
    total_amount: float
    
    class Config:
        from_attributes = True


class StockLotsResponse(BaseModel):
    """All open lots for a specific stock ticker."""
    ticker: str
    stock_name: str
    lots: List[AvailableLotResponse]
    
    class Config:
        from_attributes = True
