import { useQuery } from '@tanstack/react-query';
import { fetchPortfolioSnapshot } from '@/lib/api';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';

/**
 * Hook for fetching the live portfolio snapshot (value, cost basis, P/L, daily change).
 *
 * @param portfolioId - Portfolio ID, null for all portfolios, undefined to disable query
 */
export function usePortfolioSnapshot(portfolioId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.portfolioSnapshot(portfolioId ?? null),
    queryFn: () => fetchPortfolioSnapshot(portfolioId ?? null),
    enabled: portfolioId !== undefined,
    staleTime: STALE_TIMES.portfolioSnapshot,
  });
}
