import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPortfolios,
  createPortfolio,
  type Portfolio,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Hook for fetching portfolios list.
 * Long stale time - portfolios rarely change.
 */
export function usePortfolios() {
  return useQuery({
    queryKey: queryKeys.portfolios(),
    queryFn: fetchPortfolios,
    staleTime: STALE_TIMES.portfolios,
    gcTime: GC_TIMES.long,
  });
}

/**
 * Hook for creating a new portfolio.
 */
export function useCreatePortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createPortfolio(name),
    onSuccess: (newPortfolio) => {
      // Add to cache
      queryClient.setQueryData<Portfolio[]>(
        queryKeys.portfolios(),
        (old) => old ? [...old, newPortfolio] : [newPortfolio]
      );
    },
  });
}
