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
    ActivityTransactionResponse,
    GlobalMarketContextResponse,
    JournalNoteContentResponse,
    JournalReportContentResponse,
    PortfolioActivityResponse,
    PortfolioContextResponse,
    PortfolioJournalArchiveResponse,
    PortfolioListResponse,
    PortfolioPerformanceResponse,
    SavePortfolioJournalNoteRequest,
    SavePortfolioJournalNoteResponse,
    SaveStockJournalNoteRequest,
    SaveStockJournalNoteResponse,
    StockJournalArchiveResponse,
    StockContextResponse,
    TickerActivityResponse,
    TechnicalHistoryResponse,
    WatchlistItemsResponse,
    WatchlistListResponse,
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
    "ActivityTransactionResponse",
    "JournalNoteContentResponse",
    "JournalReportContentResponse",
    "PortfolioJournalArchiveResponse",
    "PortfolioActivityResponse",
    "StockJournalArchiveResponse",
    "StockContextResponse",
    "TickerActivityResponse",
    "TechnicalHistoryResponse",
    "SavePortfolioJournalNoteRequest",
    "SavePortfolioJournalNoteResponse",
    "SaveStockJournalNoteRequest",
    "SaveStockJournalNoteResponse",
    "PortfolioListResponse",
    "PortfolioContextResponse",
    "PortfolioPerformanceResponse",
    "GlobalMarketContextResponse",
    "WatchlistListResponse",
    "WatchlistItemsResponse",
]
