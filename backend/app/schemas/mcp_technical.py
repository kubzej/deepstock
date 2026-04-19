"""
MCP technical-analysis schemas.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TechnicalHistorySummaryResponse(BaseModel):
    trend_signal: Optional[str] = None
    trend_description: Optional[str] = None
    rsi14: Optional[float] = None
    rsi_signal: Optional[str] = None
    macd_trend: Optional[str] = None
    bollinger_signal: Optional[str] = None
    volume_signal: Optional[str] = None


class TechnicalPricePointResponse(BaseModel):
    date: str
    price: Optional[float] = None
    sma50: Optional[float] = None
    sma200: Optional[float] = None


class TechnicalMACDPointResponse(BaseModel):
    date: str
    macd: Optional[float] = None
    signal: Optional[float] = None
    histogram: Optional[float] = None


class TechnicalBollingerPointResponse(BaseModel):
    date: str
    price: Optional[float] = None
    upper: Optional[float] = None
    middle: Optional[float] = None
    lower: Optional[float] = None


class TechnicalStochasticPointResponse(BaseModel):
    date: str
    k: Optional[float] = None
    d: Optional[float] = None


class TechnicalRSIPointResponse(BaseModel):
    date: str
    rsi: Optional[float] = None


class TechnicalVolumePointResponse(BaseModel):
    date: str
    volume: int = 0
    avgVolume: Optional[float] = None
    isAboveAvg: bool = False


class TechnicalATRPointResponse(BaseModel):
    date: str
    atr: Optional[float] = None
    atrPercent: Optional[float] = None


class TechnicalOBVPointResponse(BaseModel):
    date: str
    obv: Optional[float] = None
    obvSma: Optional[float] = None


class TechnicalADXPointResponse(BaseModel):
    date: str
    adx: Optional[float] = None
    plusDI: Optional[float] = None
    minusDI: Optional[float] = None


class TechnicalFibonacciLevelResponse(BaseModel):
    ratio: Optional[float] = None
    price: Optional[float] = None
    label: Optional[str] = None


class TechnicalFibonacciPointResponse(BaseModel):
    date: str
    price: Optional[float] = None
    levels: list[TechnicalFibonacciLevelResponse] = Field(default_factory=list)


class TechnicalHistoryDataResponse(BaseModel):
    period: str
    price: list[TechnicalPricePointResponse] = Field(default_factory=list)
    macd: list[TechnicalMACDPointResponse] = Field(default_factory=list)
    bollinger: list[TechnicalBollingerPointResponse] = Field(default_factory=list)
    stochastic: list[TechnicalStochasticPointResponse] = Field(default_factory=list)
    rsi: list[TechnicalRSIPointResponse] = Field(default_factory=list)
    volume: list[TechnicalVolumePointResponse] = Field(default_factory=list)
    atr: list[TechnicalATRPointResponse] = Field(default_factory=list)
    obv: list[TechnicalOBVPointResponse] = Field(default_factory=list)
    adx: list[TechnicalADXPointResponse] = Field(default_factory=list)
    fibonacci: list[TechnicalFibonacciPointResponse] = Field(default_factory=list)


class TechnicalHistoryResponse(BaseModel):
    ticker: str
    generated_at: str
    period: str
    summary: TechnicalHistorySummaryResponse
    history: TechnicalHistoryDataResponse


__all__ = [
    "TechnicalHistorySummaryResponse",
    "TechnicalPricePointResponse",
    "TechnicalMACDPointResponse",
    "TechnicalBollingerPointResponse",
    "TechnicalStochasticPointResponse",
    "TechnicalRSIPointResponse",
    "TechnicalVolumePointResponse",
    "TechnicalATRPointResponse",
    "TechnicalOBVPointResponse",
    "TechnicalADXPointResponse",
    "TechnicalFibonacciLevelResponse",
    "TechnicalFibonacciPointResponse",
    "TechnicalHistoryDataResponse",
    "TechnicalHistoryResponse",
]
