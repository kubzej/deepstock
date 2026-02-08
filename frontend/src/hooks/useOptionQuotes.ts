import { useQuery } from '@tanstack/react-query';
import { fetchOptionQuotes, type OptionQuote } from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Hook for fetching option quotes with caching.
 * Simple approach - always fetch all requested symbols.
 * React Query handles caching and deduplication automatically.
 */
export function useOptionQuotes(occSymbols: string[]) {
  const sortedSymbols = [...new Set(occSymbols)].sort();

  return useQuery({
    queryKey: queryKeys.optionQuotes(sortedSymbols),
    queryFn: async (): Promise<Record<string, OptionQuote>> => {
      if (sortedSymbols.length === 0) return {};
      return await fetchOptionQuotes(sortedSymbols);
    },
    staleTime: STALE_TIMES.optionQuotes,
    gcTime: GC_TIMES.medium,
    enabled: sortedSymbols.length > 0,
  });
}
