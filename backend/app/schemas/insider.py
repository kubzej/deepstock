"""Insider trading schemas — SEC Form 4 data."""

from datetime import date
from pydantic import BaseModel


class InsiderTrade(BaseModel):
    """A single insider transaction parsed from SEC Form 4."""

    ticker: str
    filing_date: date
    trade_date: date
    insider_name: str
    insider_title: str | None = None
    trade_type: str  # Purchase | Sale | Option Exercise | Gift | Other
    shares: int
    price_per_share: float | None = None
    total_value: float | None = None
    shares_owned_after: int | None = None
    filing_url: str


class InsiderTradesResponse(BaseModel):
    """Response for insider trades endpoint."""

    ticker: str
    trades: list[InsiderTrade]
    source: str = "SEC EDGAR"
