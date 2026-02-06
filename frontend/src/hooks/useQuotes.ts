import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchQuotes, type Quote } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

const QUOTE_STALE_TIME = 60 * 1000; // 1 minute
const QUOTE_GC_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Normalized quotes cache - each ticker has its own cache entry.
 * 
 * Benefits:
 * - True cache normalization: ['quote', 'AAPL'] is reused everywhere
 * - Efficient updates: invalidate one ticker without affecting others
 * - No duplicate data across different query key combinations
 * 
 * Strategy:
 * - Uses batch fetch for efficiency (single API call)
 * - Stores results in individual quote caches
 * - Returns combined result for the requested tickers
 */
export function useQuotes(tickers: string[]) {
  const queryClient = useQueryClient();
  const uniqueTickers = [...new Set(tickers)].sort();
  
  return useQuery({
    queryKey: queryKeys.quotes(uniqueTickers),
    queryFn: async () => {
      if (uniqueTickers.length === 0) return {};
      
      // Check which tickers need fetching (not in individual cache or stale)
      const missing: string[] = [];
      const result: Record<string, Quote> = {};
      
      for (const ticker of uniqueTickers) {
        const cached = queryClient.getQueryData<Quote>(['quote', ticker]);
        const state = queryClient.getQueryState(['quote', ticker]);
        
        if (cached && state && !isStale(state.dataUpdatedAt, QUOTE_STALE_TIME)) {
          result[ticker] = cached;
        } else {
          missing.push(ticker);
        }
      }
      
      // Fetch missing tickers in batch
      if (missing.length > 0) {
        const newQuotes = await fetchQuotes(missing);
        
        // Store each quote in its own cache entry (normalized)
        for (const [ticker, quote] of Object.entries(newQuotes)) {
          queryClient.setQueryData(['quote', ticker], quote, {
            updatedAt: Date.now(),
          });
          result[ticker] = quote;
        }
      }
      
      return result;
    },
    staleTime: QUOTE_STALE_TIME,
    gcTime: QUOTE_GC_TIME,
    enabled: uniqueTickers.length > 0,
  });
}

/**
 * Check if data is stale based on update time.
 */
function isStale(updatedAt: number, staleTime: number): boolean {
  return Date.now() - updatedAt > staleTime;
}

/**
 * Hook for a single quote - reads from normalized cache.
 */
export function useQuote(ticker: string) {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['quote', ticker],
    queryFn: async () => {
      const quotes = await fetchQuotes([ticker]);
      return quotes[ticker] || null;
    },
    staleTime: QUOTE_STALE_TIME,
    gcTime: QUOTE_GC_TIME,
    enabled: !!ticker,
    // Try to get from existing batch queries first
    initialData: () => {
      const allQueries = queryClient.getQueriesData<Record<string, Quote>>({
        queryKey: ['quotes'],
      });
      for (const [, data] of allQueries) {
        if (data?.[ticker]) return data[ticker];
      }
      return undefined;
    },
  });
}

/**
 * Get a single quote from the cache (synchronous, no fetch).
 */
export function useCachedQuote(ticker: string): Quote | undefined {
  const queryClient = useQueryClient();
  
  // First check normalized cache
  const normalized = queryClient.getQueryData<Quote>(['quote', ticker]);
  if (normalized) return normalized;
  
  // Fallback: check batch queries
  const allQueries = queryClient.getQueriesData<Record<string, Quote>>({
    queryKey: ['quotes'],
  });
  
  for (const [, data] of allQueries) {
    if (data?.[ticker]) return data[ticker];
  }
  
  return undefined;
}

/**
 * Prefetch quotes for tickers (populates normalized cache).
 */
export function usePrefetchQuotes() {
  const queryClient = useQueryClient();
  
  return async (tickers: string[]) => {
    if (tickers.length === 0) return;
    
    const uniqueTickers = [...new Set(tickers)].sort();
    const quotes = await fetchQuotes(uniqueTickers);
    
    // Store in normalized cache
    for (const [ticker, quote] of Object.entries(quotes)) {
      queryClient.setQueryData(['quote', ticker], quote, {
        updatedAt: Date.now(),
      });
    }
    
    // Also set the batch query
    queryClient.setQueryData(queryKeys.quotes(uniqueTickers), quotes);
  };
}

/**
 * Invalidate all quotes cache (force refresh).
 */
export function useInvalidateQuotes() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['quote'] });
  };
}
