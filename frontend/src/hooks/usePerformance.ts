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
 * Hook for stock portfolio performance
 */
export function useStockPerformance(
  portfolioId?: string,
  period: PerformancePeriod = '1Y',
  customFrom?: string,
  customTo?: string
) {
  return useQuery<PerformanceResult>({
    queryKey: queryKeys.stockPerformance(portfolioId ?? 'all', period, customFrom, customTo),
    queryFn: () => fetchStockPerformance(portfolioId, period, customFrom, customTo),
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
