import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOpenLots,
  fetchAllOpenLots,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook for fetching open lots for a specific portfolio.
 */
export function useOpenLots(portfolioId: string | null) {
  return useQuery({
    queryKey: portfolioId ? queryKeys.openLots(portfolioId) : queryKeys.allOpenLots(),
    queryFn: () => portfolioId ? fetchOpenLots(portfolioId) : fetchAllOpenLots(),
    enabled: portfolioId !== undefined,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook for fetching all open lots across all portfolios.
 */
export function useAllOpenLots() {
  return useQuery({
    queryKey: queryKeys.allOpenLots(),
    queryFn: fetchAllOpenLots,
    staleTime: 2 * 60 * 1000,
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
