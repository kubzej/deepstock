import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Don't refetch on window focus (annoying UX)
      refetchOnWindowFocus: false,
      // Retry once on failure
      retry: 1,
      // Keep previous data while fetching new
      placeholderData: (previousData: unknown) => previousData,
    },
  },
});

// Query key factory for consistent keys
export const queryKeys = {
  // Quotes
  quotes: (tickers: string[]) => ['quotes', tickers.sort().join(',')] as const,
  
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
} as const;
