"""API request and response models for portfolio."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class TransactionCreate(BaseModel):
    stock_ticker: str
    stock_name: Optional[str] = None
    type: str  # BUY or SELL
    shares: float = Field(gt=0)
    price_per_share: float = Field(gt=0)
    currency: str = "USD"
    exchange_rate_to_czk: Optional[float] = Field(default=None, gt=0)
    fees: float = Field(default=0, ge=0)
    notes: Optional[str] = None
    executed_at: datetime
    source_transaction_id: Optional[str] = None  # For SELL: which lot to sell from

    @field_validator("type")
    @classmethod
    def _type_is_buy_or_sell(cls, value: str) -> str:
        if value.upper() not in ("BUY", "SELL"):
            raise ValueError("type must be BUY or SELL")
        return value


class TransactionUpdate(BaseModel):
    """Update model for transactions - all fields optional."""
    shares: Optional[float] = Field(default=None, gt=0)
    price_per_share: Optional[float] = Field(default=None, gt=0)
    currency: Optional[str] = None
    exchange_rate_to_czk: Optional[float] = Field(default=None, gt=0)
    fees: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    executed_at: Optional[datetime] = None


class AvailableLot(BaseModel):
    """A BUY lot with remaining shares available for selling."""
    id: str
    date: str
    quantity: float  # Original quantity
    remaining_shares: float  # Shares not yet sold
    price_per_share: float
    currency: str
    total_amount: float
    economic_price_per_share: float
    remaining_cost_basis: float
    remaining_cost_basis_czk: float


class PortfolioSnapshot(BaseModel):
    total_value_czk: float
    total_cost_czk: float
    total_pnl_czk: float
    total_pnl_percent: float
    daily_change_czk: float
    daily_change_percent: float
    # Holdings without a live quote are left out of value, cost and P/L alike.
    missing_tickers: list[str] = Field(default_factory=list)
