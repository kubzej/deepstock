"""
MCP market-related schemas.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class SmartAnalysisLabelResponse(BaseModel):
    text: Optional[str] = None
    tone: Optional[Literal["positive", "neutral", "warning", "negative"]] = None


class SmartAnalysisResponse(BaseModel):
    verdict: str
    valuation_signal: Optional[str] = None
    valuation_label: SmartAnalysisLabelResponse
    technical_note: Optional[str] = None
    positives: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    infos: list[dict[str, Any]] = Field(default_factory=list)


class TechnicalSummaryResponse(BaseModel):
    trend_signal: Optional[str] = None
    trend_description: Optional[str] = None
    rsi14: Optional[float] = None
    rsi_signal: Optional[str] = None
    macd_trend: Optional[str] = None
    price_vs_sma50: Optional[float] = None
    price_vs_sma200: Optional[float] = None
    bollinger_signal: Optional[str] = None
    volume_signal: Optional[str] = None


class TechnicalSummaryContainerResponse(BaseModel):
    summary: TechnicalSummaryResponse


class MarketContextResponse(BaseModel):
    fundamentals: dict[str, Any] = Field(default_factory=dict)
    historical_financials: Optional[dict[str, Any]] = None
    valuation: Optional[dict[str, Any]] = None
    smart_analysis: SmartAnalysisResponse
    technicals: TechnicalSummaryContainerResponse


class MarketQuoteItemResponse(BaseModel):
    ticker: str
    name: str
    description: str
    inverted: bool = False
    price: Optional[float] = None
    change_percent: Optional[float] = None
    volume: Optional[float] = None
    avg_volume: Optional[float] = None
    last_updated: Optional[str] = None


class FearGreedResponse(BaseModel):
    score: Optional[float] = None
    rating: Optional[str] = None
    previous_close: Optional[float] = None
    previous_week: Optional[float] = None
    previous_month: Optional[float] = None
    previous_year: Optional[float] = None


class FXContextResponse(BaseModel):
    rates_to_czk: dict[str, float] = Field(default_factory=dict)


class GlobalMarketContextResponse(BaseModel):
    generated_at: str
    sentiment: FearGreedResponse
    fx: FXContextResponse
    macro_quotes: list[MarketQuoteItemResponse] = Field(default_factory=list)


__all__ = [
    "SmartAnalysisLabelResponse",
    "SmartAnalysisResponse",
    "TechnicalSummaryResponse",
    "TechnicalSummaryContainerResponse",
    "MarketContextResponse",
    "MarketQuoteItemResponse",
    "FearGreedResponse",
    "FXContextResponse",
    "GlobalMarketContextResponse",
]
