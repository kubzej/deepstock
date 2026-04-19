"""
MCP activity-related schemas.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class OptionHoldingResponse(BaseModel):
    portfolio_id: Optional[str] = None
    option_symbol: Optional[str] = None
    option_type: Optional[str] = None
    strike: Optional[float] = None
    expiration: Optional[str] = None
    position: Optional[str] = None
    contracts: Optional[int] = None
    avg_premium: Optional[float] = None
    total_cost: Optional[float] = None
    currency: Optional[str] = None


class OptionSummaryResponse(BaseModel):
    has_option_activity: bool = False
    open_positions: int = 0
    contracts: int = 0
    open_holdings: list[OptionHoldingResponse] = Field(default_factory=list)


class PositionSummaryResponse(BaseModel):
    has_position: bool = False
    shares: float = 0.0
    total_cost: float = 0.0
    market_value: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    currency: Optional[str] = None


class ActivityContextSummaryResponse(BaseModel):
    position_summary: PositionSummaryResponse = Field(default_factory=PositionSummaryResponse)
    stock_transaction_count: int = 0
    latest_stock_transaction_at: Optional[str] = None
    has_more_stock_transactions: bool = False
    option_summary: OptionSummaryResponse = Field(default_factory=OptionSummaryResponse)
    option_transaction_count: int = 0
    latest_option_transaction_at: Optional[str] = None
    has_more_option_transactions: bool = False


class ActivityTransactionResponse(BaseModel):
    id: Optional[str] = None
    asset_type: Literal["stock", "option"]
    portfolio_id: Optional[str] = None
    portfolio_name: str = ""
    executed_at: Optional[str] = None
    ticker: Optional[str] = None
    type: Optional[str] = None
    action: Optional[str] = None
    shares: Optional[float] = None
    price_per_share: Optional[float] = None
    option_symbol: Optional[str] = None
    option_type: Optional[str] = None
    strike: Optional[float] = None
    expiration: Optional[str] = None
    contracts: Optional[int] = None
    premium: Optional[float] = None
    currency: Optional[str] = None
    fees: float = 0.0
    notes: Optional[str] = None
    source_transaction_id: Optional[str] = None
    remaining_shares: Optional[float] = None
    realized_pnl: Optional[float] = None
    realized_pnl_czk: Optional[float] = None
    position_after: Optional[str] = None


class ActivityPageResponse(BaseModel):
    period: str
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    limit: int = 0
    cursor: Optional[str] = None
    next_cursor: Optional[str] = None
    has_more: bool = False


class TickerActivityResponse(ActivityPageResponse):
    ticker: str
    generated_at: str
    position_summary: PositionSummaryResponse
    transactions: list[ActivityTransactionResponse] = Field(default_factory=list)
    option_summary: OptionSummaryResponse


class PortfolioActivityResponse(ActivityPageResponse):
    scope: str
    generated_at: str
    portfolio_id: Optional[str] = None
    portfolio_name: Optional[str] = None
    portfolio_count: int = 0
    transactions: list[ActivityTransactionResponse] = Field(default_factory=list)


__all__ = [
    "OptionHoldingResponse",
    "OptionSummaryResponse",
    "PositionSummaryResponse",
    "ActivityContextSummaryResponse",
    "ActivityTransactionResponse",
    "ActivityPageResponse",
    "TickerActivityResponse",
    "PortfolioActivityResponse",
]
