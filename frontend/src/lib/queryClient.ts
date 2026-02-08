import { QueryClient } from '@tanstack/react-query';

/**
 * Centralized stale time configuration.
 *
 * Strategy:
 * - Market data (quotes, prices): Longer stale time (10 min) - manual refresh when needed
 * - User data (holdings, transactions): Medium stale time (5 min) - only changes via CRUD
 * - Static data (stocks, portfolios): Long stale time (30 min) - rarely changes
 * - FX rates: Very long (1 hour) - changes slowly
 */
export const STALE_TIMES = {
  // Market data - longer cache, manual refresh when needed
  quotes: 10 * 60 * 1000,      // 10 minutes
  optionQuotes: 10 * 60 * 1000, // 10 minutes
  
  // User portfolio data - changes via user actions
  holdings: 5 * 60 * 1000,     // 5 minutes
  openLots: 5 * 60 * 1000,     // 5 minutes
  transactions: 10 * 60 * 1000, // 10 minutes
  
  // Configuration data - rarely changes
  portfolios: 30 * 60 * 1000,  // 30 minutes
  stocks: 30 * 60 * 1000,      // 30 minutes (master data)
  watchlists: Infinity,        // Only invalidate on CRUD
  
  // External data
  exchangeRates: 60 * 60 * 1000, // 1 hour
  stockInfo: 10 * 60 * 1000,     // 10 minutes
  technicalIndicators: 10 * 60 * 1000, // 10 minutes
  insiderTrades: 30 * 60 * 1000,  // 30 minutes (cached 12h on backend)
} as const;

/**
 * Garbage collection times (how long to keep unused data).
 */
export const GC_TIMES = {
  short: 5 * 60 * 1000,         // 5 minutes
  medium: 30 * 60 * 1000,       // 30 minutes
  long: 60 * 60 * 1000,         // 1 hour
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 30 minutes
      gcTime: GC_TIMES.medium,
      // Don't refetch on window focus (annoying UX)
      refetchOnWindowFocus: false,
      // Retry once on failure
      retry: 1,
      // Keep previous data while fetching new (stale-while-revalidate)
      placeholderData: (previousData: unknown) => previousData,
    },
  },
});

// Query key factory for consistent keys
export const queryKeys = {
  // Quotes
  quotes: (tickers: string[]) => ['quotes', tickers.sort().join(',')] as const,
  quote: (ticker: string) => ['quote', ticker] as const,
  
  // Holdings
  holdings: (portfolioId: string) => ['holdings', portfolioId] as const,
  allHoldings: () => ['holdings', 'all'] as const,
  
  // Open Lots
  openLots: (portfolioId: string) => ['openLots', portfolioId] as const,
  allOpenLots: () => ['openLots', 'all'] as const,
  
  // Portfolios
  portfolios: () => ['portfolios'] as const,
  
  // Watchlists
  watchlists: () => ['watchlists'] as const,
  watchlistItems: (watchlistId: string) => ['watchlistItems', watchlistId] as const,
  watchlistTickers: () => ['watchlistTickers'] as const,
  
  // Watchlist Tags
  watchlistTags: () => ['watchlistTags'] as const,
  itemTags: (itemId: string) => ['itemTags', itemId] as const,
  
  // Exchange rates
  exchangeRates: () => ['exchangeRates'] as const,
  
  // Stock data
  stock: (ticker: string) => ['stock', ticker] as const,
  priceHistory: (ticker: string, period: string) => ['priceHistory', ticker, period] as const,
  
  // Transactions
  transactions: (portfolioId: string) => ['transactions', portfolioId] as const,
  allTransactions: () => ['transactions', 'all'] as const,
  
  // Options
  optionHoldings: (portfolioId?: string) => portfolioId 
    ? ['optionHoldings', portfolioId] as const 
    : ['optionHoldings', 'all'] as const,
  optionTransactions: (portfolioId?: string) => portfolioId
    ? ['optionTransactions', portfolioId] as const
    : ['optionTransactions', 'all'] as const,
  optionStats: (portfolioId?: string) => portfolioId
    ? ['optionStats', portfolioId] as const
    : ['optionStats', 'all'] as const,
  optionQuotes: (symbols: string[]) => ['optionQuotes', symbols.sort().join(',')] as const,

  // Insider trading
  insiderTrades: (ticker: string) => ['insiderTrades', ticker.toUpperCase()] as const,
} as const;
