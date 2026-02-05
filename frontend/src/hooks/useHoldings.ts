import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchHoldings,
  fetchAllHoldings,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Hook for fetching holdings for a specific portfolio.
 * Uses stale-while-revalidate: shows cached data immediately, refetches in background.
 */
export function useHoldings(portfolioId: string | null) {
  return useQuery({
    queryKey: portfolioId ? queryKeys.holdings(portfolioId) : queryKeys.allHoldings(),
    queryFn: () => portfolioId ? fetchHoldings(portfolioId) : fetchAllHoldings(),
    enabled: portfolioId !== undefined, // Allow null for "all portfolios"
    staleTime: STALE_TIMES.holdings,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Hook for fetching all holdings across all portfolios.
 */
export function useAllHoldings() {
  return useQuery({
    queryKey: queryKeys.allHoldings(),
    queryFn: fetchAllHoldings,
    staleTime: STALE_TIMES.holdings,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Invalidate holdings cache.
 */
export function useInvalidateHoldings() {
  const queryClient = useQueryClient();

  return (portfolioId?: string) => {
    if (portfolioId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.holdings(portfolioId) });
    } else {
      // Invalidate all holdings queries
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    }
  };
}
