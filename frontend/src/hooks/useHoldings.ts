import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchHoldings,
  fetchAllHoldings,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook for fetching holdings for a specific portfolio.
 */
export function useHoldings(portfolioId: string | null) {
  return useQuery({
    queryKey: portfolioId ? queryKeys.holdings(portfolioId) : queryKeys.allHoldings(),
    queryFn: () => portfolioId ? fetchHoldings(portfolioId) : fetchAllHoldings(),
    enabled: portfolioId !== undefined, // Allow null for "all portfolios"
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook for fetching all holdings across all portfolios.
 */
export function useAllHoldings() {
  return useQuery({
    queryKey: queryKeys.allHoldings(),
    queryFn: fetchAllHoldings,
    staleTime: 2 * 60 * 1000,
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
