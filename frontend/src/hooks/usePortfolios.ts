import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPortfolios,
  createPortfolio,
  type Portfolio,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook for fetching portfolios list.
 */
export function usePortfolios() {
  return useQuery({
    queryKey: queryKeys.portfolios(),
    queryFn: fetchPortfolios,
    staleTime: 10 * 60 * 1000, // 10 minutes - portfolios rarely change
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
