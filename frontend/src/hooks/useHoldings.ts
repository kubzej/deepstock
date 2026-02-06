import { useQuery } from '@tanstack/react-query';
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
