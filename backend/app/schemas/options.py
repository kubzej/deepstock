"""API request and response models for options."""
import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


OptionType = Literal["call", "put"]
OptionAction = Literal["BTO", "STC", "STO", "BTC", "EXPIRATION", "ASSIGNMENT", "EXERCISE"]
OptionOpenAction = Literal["BTO", "STO"]


class OptionTransactionCreate(BaseModel):
    """Open an option position (closing goes through close_position)."""
    symbol: str = Field(..., description="Underlying ticker (e.g., AAPL)")
    option_type: OptionType
    strike_price: float
    expiration_date: datetime.date
    action: OptionOpenAction
    contracts: int = Field(..., gt=0)
    premium: float  # Per share
    currency: str = "USD"
    exchange_rate_to_czk: Optional[float] = None
    fees: float = 0
    date: datetime.date
    notes: Optional[str] = None
