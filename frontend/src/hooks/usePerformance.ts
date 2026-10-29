/**
 * Hook for fetching portfolio performance data
 */
import { useQuery } from '@tanstack/react-query';
import {
  fetchStockPerformance,
  fetchOptionsPerformance,
  type PerformanceResult,
  type PerformancePeriod,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Hook for stock portfolio performance over an exact range
 * @param from - First day, YYYY-MM-DD
 * @param to - Last day, YYYY-MM-DD
 */
export function useStockPerformance(
  portfolioId: string | undefined,
  from: string,
  to: string
) {
  return useQuery<PerformanceResult>({
    queryKey: queryKeys.stockPerformance(portfolioId ?? 'all', from, to),
    queryFn: () => fetchStockPerformance(portfolioId, from, to),
    staleTime: STALE_TIMES.performance,
    gcTime: GC_TIMES.veryLong,
  });
}

/**
 * Hook for options performance
 */
export function useOptionsPerformance(
  portfolioId?: string,
  period: PerformancePeriod = '1Y'
) {
  return useQuery<PerformanceResult>({
    queryKey: queryKeys.optionsPerformance(portfolioId ?? 'all', period),
    queryFn: () => fetchOptionsPerformance(portfolioId, period),
    staleTime: STALE_TIMES.performance,
    gcTime: GC_TIMES.veryLong,
  });
}
