"""
MCP response schemas.

Typed contracts for the DeepStock chat/MCP surface so FastAPI docs and tests
can describe the actual payloads external agents depend on.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class TickerInfoResponse(BaseModel):
    symbol: Optional[str] = None
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    description: Optional[str] = None


class JournalNotePreviewResponse(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    type: str = "note"
    preview: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIReportPreviewResponse(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None
    report_type: Optional[str] = None
    model: Optional[str] = None
    preview: str = ""
    content_length: int = 0


class JournalContextSummaryResponse(BaseModel):
    note_count: int = 0
    report_count: int = 0
    latest_note_at: Optional[str] = None
    latest_report_at: Optional[str] = None
    has_more_notes: bool = False
    has_more_reports: bool = False
    notes: list[JournalNotePreviewResponse] = Field(default_factory=list)
    reports: list[AIReportPreviewResponse] = Field(default_factory=list)


class PositionSummaryResponse(BaseModel):
    has_position: bool = False
    shares: float = 0.0
    total_cost: float = 0.0
    market_value: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    currency: Optional[str] = None


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


class ActivityContextSummaryResponse(BaseModel):
    position_summary: PositionSummaryResponse = Field(default_factory=PositionSummaryResponse)
    stock_transaction_count: int = 0
    latest_stock_transaction_at: Optional[str] = None
    has_more_stock_transactions: bool = False
    option_summary: OptionSummaryResponse = Field(default_factory=OptionSummaryResponse)
    option_transaction_count: int = 0
    latest_option_transaction_at: Optional[str] = None
    has_more_option_transactions: bool = False


class WatchlistItemResponse(BaseModel):
    id: Optional[str] = None
    watchlist_id: Optional[str] = None
    watchlist_name: str = ""
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notes: Optional[str] = None
    sector: Optional[str] = None
    added_at: Optional[str] = None


class WatchlistContextResponse(BaseModel):
    count: int = 0
    items: list[WatchlistItemResponse] = Field(default_factory=list)


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


class StockContextResponse(BaseModel):
    ticker: str
    generated_at: str
    ticker_info: TickerInfoResponse
    journal_context: JournalContextSummaryResponse
    activity_context: ActivityContextSummaryResponse
    watchlist_context: WatchlistContextResponse
    market_context: MarketContextResponse


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


class TechnicalHistorySummaryResponse(BaseModel):
    trend_signal: Optional[str] = None
    trend_description: Optional[str] = None
    rsi14: Optional[float] = None
    rsi_signal: Optional[str] = None
    macd_trend: Optional[str] = None
    bollinger_signal: Optional[str] = None
    volume_signal: Optional[str] = None


class PerformanceDataPointResponse(BaseModel):
    date: str
    value: float
    invested: float
    benchmark: Optional[float] = None


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


class StockJournalArchiveResponse(BaseModel):
    ticker: str
    generated_at: str
    reports: list[AIReportPreviewResponse] = Field(default_factory=list)
    notes: list[JournalNotePreviewResponse] = Field(default_factory=list)


class PortfolioJournalArchiveResponse(BaseModel):
    portfolio_id: str
    portfolio_name: str
    generated_at: str
    reports: list[AIReportPreviewResponse] = Field(default_factory=list)
    notes: list[JournalNotePreviewResponse] = Field(default_factory=list)


class JournalReportContentResponse(BaseModel):
    id: str
    created_at: Optional[str] = None
    report_type: Optional[str] = None
    model: Optional[str] = None
    content: str = ""
    content_format: Literal["markdown"] = "markdown"


class JournalNoteContentResponse(BaseModel):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    type: str = "note"
    content: str = ""
    content_format: Literal["plain_text"] = "plain_text"
    metadata: dict[str, Any] = Field(default_factory=dict)


class SaveStockJournalNoteRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    content: str = Field(min_length=1, max_length=10000)

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Ticker cannot be empty")
        return normalized

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Content cannot be empty")
        return stripped


class SaveStockJournalNoteResponse(BaseModel):
    entry_id: str
    ticker: str
    channel_id: str
    created_at: Optional[str] = None
    content: str
    content_format: Literal["plain_text"] = "plain_text"
    metadata: dict[str, Any] = Field(default_factory=dict)


class SavePortfolioJournalNoteRequest(BaseModel):
    portfolio_id: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=10000)

    @field_validator("portfolio_id")
    @classmethod
    def validate_portfolio_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Portfolio ID cannot be empty")
        return normalized

    @field_validator("content")
    @classmethod
    def validate_portfolio_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Content cannot be empty")
        return stripped


class SavePortfolioJournalNoteResponse(BaseModel):
    entry_id: str
    portfolio_id: str
    portfolio_name: str
    channel_id: str
    created_at: Optional[str] = None
    content: str
    content_format: Literal["plain_text"] = "plain_text"
    metadata: dict[str, Any] = Field(default_factory=dict)


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
