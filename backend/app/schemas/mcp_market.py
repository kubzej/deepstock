"""
MCP market-related schemas.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


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


class MarketValuationModelResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    modelId: Optional[str] = None
    method: str
    description: str = ""
    tooltip: Optional[str] = None
    fairValue: Optional[float] = None
    upside: Optional[float] = None
    inputs: dict[str, Any] = Field(default_factory=dict)
    confidence: Optional[str] = None
    horizon: Optional[str] = None
    horizonLabel: Optional[str] = None
    normalizationNotes: list[str] = Field(default_factory=list)
    includedInComposite: Optional[bool] = None
    compositeExclusionReason: Optional[str] = None
    compositeWeight: Optional[float] = None
    compositeWeightReason: Optional[str] = None


class MarketNormalizationResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    profile: Optional[str] = None
    eps: Optional[float] = None
    fcfPerShare: Optional[float] = None
    growth: Optional[float] = None
    epsGrowth: Optional[float] = None
    ebitda: Optional[float] = None
    notes: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class MarketValuationResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    composite: Optional[dict[str, Any]] = None
    models: list[MarketValuationModelResponse] = Field(default_factory=list)
    normalization: Optional[MarketNormalizationResponse] = None
    currentPrice: Optional[float] = None
    currency: Optional[str] = None
    modelErrors: list[dict[str, Any]] = Field(default_factory=list)


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
    valuation: Optional[MarketValuationResponse] = None
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
    "MarketValuationModelResponse",
    "MarketNormalizationResponse",
    "MarketValuationResponse",
    "TechnicalSummaryResponse",
    "TechnicalSummaryContainerResponse",
    "MarketContextResponse",
    "MarketQuoteItemResponse",
    "FearGreedResponse",
    "FXContextResponse",
    "GlobalMarketContextResponse",
]
