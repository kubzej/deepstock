# Backend Pydantic Schemas
# Re-export all schemas for easy importing

from .portfolio import (
    PortfolioResponse,
    HoldingResponse,
    TransactionResponse,
    OpenLotResponse,
    AvailableLotResponse,
)

from .stocks import (
    StockResponse,
)

from .watchlist import (
    WatchlistResponse,
    WatchlistItemResponse,
    WatchlistTagResponse,
)

from .market import (
    QuoteResponse,
    ExchangeRatesResponse,
)

from .price_alerts import (
    PriceAlertCreate,
    PriceAlertUpdate,
    PriceAlertResponse,
    PriceAlertResetRequest,
    PriceAlertTriggerInfo,
)
from .mcp import (
    GlobalMarketContextResponse,
    StockContextResponse,
    InvestmentActivityResponse,
    TechnicalHistoryResponse,
    ResearchArchiveResponse,
    ReportContentResponse,
    NoteContentResponse,
    SaveStockJournalNoteRequest,
    SaveStockJournalNoteResponse,
    PortfolioContextResponse,
    PortfolioListResponse,
    PortfolioPerformanceResponse,
)

__all__ = [
    # Portfolio
    "PortfolioResponse",
    "HoldingResponse",
    "TransactionResponse",
    "OpenLotResponse",
    "AvailableLotResponse",
    # Stocks
    "StockResponse",
    # Watchlist
    "WatchlistResponse",
    "WatchlistItemResponse",
    "WatchlistTagResponse",
    # Market
    "QuoteResponse",
    "ExchangeRatesResponse",
    # Price Alerts
    "PriceAlertCreate",
    "PriceAlertUpdate",
    "PriceAlertResponse",
    "PriceAlertResetRequest",
    "PriceAlertTriggerInfo",
    # MCP
    "StockContextResponse",
    "InvestmentActivityResponse",
    "TechnicalHistoryResponse",
    "ResearchArchiveResponse",
    "ReportContentResponse",
    "NoteContentResponse",
    "SaveStockJournalNoteRequest",
    "SaveStockJournalNoteResponse",
    "PortfolioListResponse",
    "PortfolioContextResponse",
    "PortfolioPerformanceResponse",
    "GlobalMarketContextResponse",
]
