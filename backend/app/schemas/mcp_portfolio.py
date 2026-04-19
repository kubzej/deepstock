"""
MCP portfolio-related schemas.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from .mcp_activity import ActivityTransactionResponse


class PortfolioSnapshotResponse(BaseModel):
    total_value_czk: float
    total_cost_czk: float
    total_pnl_czk: float
    total_pnl_percent: float
    daily_change_czk: float
    daily_change_percent: float


class PortfolioSummaryResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    snapshot: Optional[PortfolioSnapshotResponse] = None


class PortfolioListResponse(BaseModel):
    generated_at: str
    portfolio_count: int = 0
    portfolios: list[PortfolioSummaryResponse] = Field(default_factory=list)


class PortfolioHoldingResponse(BaseModel):
    portfolio_id: Optional[str] = None
    portfolio_name: Optional[str] = None
    ticker: str
    name: str
    shares: float
    avg_cost: float
    currency: str
    sector: Optional[str] = None
    total_invested_czk: float
    current_price: Optional[float] = None
    current_value_czk: Optional[float] = None
    unrealized_pnl_czk: Optional[float] = None
    unrealized_pnl_pct: Optional[float] = None


class SectorExposureResponse(BaseModel):
    sector: str
    value_czk: float
    weight_pct: float


class OpenLotsSummaryResponse(BaseModel):
    count: int = 0
    tickers: list[str] = Field(default_factory=list)


class PortfolioContextResponse(BaseModel):
    scope: str
    generated_at: str
    portfolio_count: int = 0
    portfolios: list[PortfolioSummaryResponse] = Field(default_factory=list)
    aggregate_snapshot: PortfolioSnapshotResponse
    holdings: list[PortfolioHoldingResponse] = Field(default_factory=list)
    sector_exposure: list[SectorExposureResponse] = Field(default_factory=list)
    recent_transactions: list[ActivityTransactionResponse] = Field(default_factory=list)
    open_lots_summary: OpenLotsSummaryResponse = Field(default_factory=OpenLotsSummaryResponse)


class PerformanceDataPointResponse(BaseModel):
    date: str
    value: float
    invested: float
    benchmark: Optional[float] = None


class NamedPerformanceResponse(BaseModel):
    total_return: float
    total_return_pct: float
    benchmark_return_pct: Optional[float] = None
    data: list[PerformanceDataPointResponse] = Field(default_factory=list)


class PortfolioPerformanceResponse(BaseModel):
    scope: str
    generated_at: str
    period: str
    stock_performance: NamedPerformanceResponse
    options_performance: NamedPerformanceResponse


__all__ = [
    "PortfolioSnapshotResponse",
    "PortfolioSummaryResponse",
    "PortfolioListResponse",
    "PortfolioHoldingResponse",
    "SectorExposureResponse",
    "OpenLotsSummaryResponse",
    "PortfolioContextResponse",
    "PerformanceDataPointResponse",
    "NamedPerformanceResponse",
    "PortfolioPerformanceResponse",
]
