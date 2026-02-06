import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOpenLots,
  fetchAllOpenLots,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Hook for fetching open lots for a specific portfolio.
 */
export function useOpenLots(portfolioId: string | null) {
  return useQuery({
    queryKey: portfolioId ? queryKeys.openLots(portfolioId) : queryKeys.allOpenLots(),
    queryFn: () => portfolioId ? fetchOpenLots(portfolioId) : fetchAllOpenLots(),
    enabled: portfolioId !== undefined,
    staleTime: STALE_TIMES.openLots,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Hook for fetching all open lots across all portfolios.
 */
export function useAllOpenLots() {
  return useQuery({
    queryKey: queryKeys.allOpenLots(),
    queryFn: fetchAllOpenLots,
    staleTime: STALE_TIMES.openLots,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Invalidate open lots cache.
 */
export function useInvalidateOpenLots() {
  const queryClient = useQueryClient();

  return (portfolioId?: string) => {
    if (portfolioId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.openLots(portfolioId) });
    } else {
      queryClient.invalidateQueries({ queryKey: ['openLots'] });
    }
  };
}
