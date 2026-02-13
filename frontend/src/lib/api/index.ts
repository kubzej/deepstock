/**
 * API Module - Re-exports all API functions for backwards compatibility
 * 
 * Instead of importing from '@/lib/api', you can now import from specific modules:
 * - '@/lib/api/market' - Quotes, price history, stock info, technical indicators
 * - '@/lib/api/portfolio' - Portfolio CRUD, holdings, transactions, open lots
 * - '@/lib/api/stocks' - Stocks CRUD
 * - '@/lib/api/watchlists' - Watchlists, items, tags
 * - '@/lib/api/options' - Options trading
 * - '@/lib/api/client' - Core API setup (API_URL, getAuthHeader)
 */

// Client
export { API_URL, getAuthHeader } from './client';

// Market
export {
  // Types
  type Quote,
  type ExchangeRates,
  type OptionQuote,
  type PriceHistoryPoint,
  type ChartPeriod,
  type StockInfo,
  type TechnicalPeriod,
  type TrendSignalType,
  type IndicatorSignalType,
  type PriceHistoryPointWithSMA,
  type MACDHistoryPoint,
  type BollingerHistoryPoint,
  type StochasticHistoryPoint,
  type RSIHistoryPoint,
  type VolumeHistoryPoint,
  type ATRHistoryPoint,
  type OBVHistoryPoint,
  type ADXHistoryPoint,
  type FibonacciLevels,
  type FibonacciHistoryPoint,
  type TechnicalData,
  // Constants
  DEFAULT_RATES,
  // Functions
  fetchQuotes,
  fetchOptionQuotes,
  fetchExchangeRates,
  fetchPriceHistory,
  fetchStockInfo,
  fetchTechnicalIndicators,
} from './market';

// Portfolio
export {
  // Types
  type Portfolio,
  type Holding,
  type Transaction,
  type SourceTransaction,
  type OpenLot,
  type TransactionUpdateData,
  type PerformancePoint,
  type PerformanceResult,
  type PerformancePeriod,
  // Functions
  fetchPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  fetchHoldings,
  fetchAllHoldings,
  fetchOpenLots,
  fetchAllOpenLots,
  fetchTransactions,
  fetchAllTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  fetchStockPerformance,
  fetchOptionsPerformance,
} from './portfolio';

// Stocks
export {
  // Types
  type Stock,
  // Functions
  fetchStocks,
  searchStocks,
  fetchStock,
  createStock,
  updateStock,
  deleteStock,
} from './stocks';

// Watchlists
export {
  // Types
  type Watchlist,
  type WatchlistItem,
  type WatchlistItemWithSource,
  type WatchlistTag,
  // Functions
  fetchWatchlists,
  fetchAllWatchlistTickers,
  fetchAllWatchlistItems,
  fetchWatchlist,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  reorderWatchlists,
  fetchWatchlistItems,
  addWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  moveWatchlistItem,
  fetchWatchlistTags,
  createWatchlistTag,
  updateWatchlistTag,
  deleteWatchlistTag,
  fetchItemTags,
  setItemTags,
} from './watchlists';

// Options
export {
  // Types
  type OptionType,
  type OptionAction,
  type OptionPosition,
  type Moneyness,
  type OptionTransaction,
  type OptionHolding,
  type OptionStats,
  type CreateOptionTransactionInput,
  type UpdateOptionTransactionInput,
  // Functions
  fetchOptionHoldings,
  fetchOptionTransactions,
  fetchOptionStats,
  createOptionTransaction,
  updateOptionTransaction,
  deleteOptionTransaction,
  deleteOptionTransactionsBySymbol,
  closeOptionPosition,
} from './options';

// Insider Trading
export {
  type InsiderTrade,
  type InsiderTradesResponse,
  fetchInsiderTrades,
} from './insider';

// Price Alerts
export {
  type AlertConditionType,
  type PriceAlert,
  type PriceAlertCreate,
  type PriceAlertUpdate,
  fetchAlerts,
  fetchActiveAlerts,
  fetchAlert,
  createAlert,
  updateAlert,
  deleteAlert,
  resetAlert,
  toggleAlert,
} from './alerts';
