import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOptionQuotes, type OptionQuote } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook for fetching option quotes with caching.
 * Same pattern as useQuotes for stocks.
 */
export function useOptionQuotes(occSymbols: string[]) {
  const queryClient = useQueryClient();
  const sortedSymbols = [...occSymbols].sort();

  return useQuery({
    queryKey: queryKeys.optionQuotes(sortedSymbols),
    queryFn: async () => {
      if (sortedSymbols.length === 0) return {};

      // Check what we already have in cache
      const cached: Record<string, OptionQuote> = {};
      const missing: string[] = [];

      for (const symbol of sortedSymbols) {
        const allQueries = queryClient.getQueriesData<Record<string, OptionQuote>>({
          queryKey: ['optionQuotes'],
        });

        let found = false;
        for (const [, data] of allQueries) {
          if (data && data[symbol]) {
            cached[symbol] = data[symbol];
            found = true;
            break;
          }
        }

        if (!found) {
          missing.push(symbol);
        }
      }

      // Fetch only missing symbols
      if (missing.length > 0) {
        const newQuotes = await fetchOptionQuotes(missing);
        return { ...cached, ...newQuotes };
      }

      return cached;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - refresh manually when needed
    gcTime: 30 * 60 * 1000, // 30 minutes cache
    enabled: occSymbols.length > 0,
  });
}

/**
 * Invalidate all option quotes cache.
 */
export function useInvalidateOptionQuotes() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['optionQuotes'] });
  };
}
