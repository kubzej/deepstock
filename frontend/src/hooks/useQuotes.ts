import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchQuotes, type Quote } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Global quotes hook with smart caching.
 * 
 * Features:
 * - Shares cache across all components
 * - Only fetches missing tickers (deduplication)
 * - Background revalidation (stale-while-revalidate)
 * - 1 minute stale time for quotes
 */
export function useQuotes(tickers: string[]) {
  const queryClient = useQueryClient();
  const sortedTickers = [...tickers].sort();
  
  return useQuery({
    queryKey: queryKeys.quotes(sortedTickers),
    queryFn: async () => {
      if (sortedTickers.length === 0) return {};
      
      // Check what we already have in cache
      const cached: Record<string, Quote> = {};
      const missing: string[] = [];
      
      for (const ticker of sortedTickers) {
        // Try to find this ticker in any existing quotes query
        const allQueries = queryClient.getQueriesData<Record<string, Quote>>({
          queryKey: ['quotes'],
        });
        
        let found = false;
        for (const [, data] of allQueries) {
          if (data && data[ticker]) {
            cached[ticker] = data[ticker];
            found = true;
            break;
          }
        }
        
        if (!found) {
          missing.push(ticker);
        }
      }
      
      // Fetch only missing tickers
      if (missing.length > 0) {
        const newQuotes = await fetchQuotes(missing);
        return { ...cached, ...newQuotes };
      }
      
      return cached;
    },
    staleTime: 60 * 1000, // 1 minute for quotes
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: tickers.length > 0,
  });
}

/**
 * Get a single quote from the global cache.
 * Returns undefined if not in cache (doesn't trigger fetch).
 */
export function useCachedQuote(ticker: string): Quote | undefined {
  const queryClient = useQueryClient();
  
  const allQueries = queryClient.getQueriesData<Record<string, Quote>>({
    queryKey: ['quotes'],
  });
  
  for (const [, data] of allQueries) {
    if (data && data[ticker]) {
      return data[ticker];
    }
  }
  
  return undefined;
}

/**
 * Prefetch quotes for tickers (useful for eager loading).
 */
export function usePrefetchQuotes() {
  const queryClient = useQueryClient();
  
  return (tickers: string[]) => {
    if (tickers.length === 0) return;
    
    const sortedTickers = [...tickers].sort();
    queryClient.prefetchQuery({
      queryKey: queryKeys.quotes(sortedTickers),
      queryFn: () => fetchQuotes(sortedTickers),
      staleTime: 60 * 1000,
    });
  };
}

/**
 * Invalidate all quotes cache (force refresh).
 */
export function useInvalidateQuotes() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
  };
}
