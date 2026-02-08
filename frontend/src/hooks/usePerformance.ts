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

const PERFORMANCE_STALE_TIME = 60 * 60 * 1000; // 1 hour
const PERFORMANCE_GC_TIME = 2 * 60 * 60 * 1000; // 2 hours

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
    queryKey: ['stockPerformance', portfolioId || 'all', period, customFrom, customTo],
    queryFn: () => fetchStockPerformance(portfolioId, period, customFrom, customTo),
    staleTime: PERFORMANCE_STALE_TIME,
    gcTime: PERFORMANCE_GC_TIME,
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
    queryKey: ['optionsPerformance', portfolioId || 'all', period],
    queryFn: () => fetchOptionsPerformance(portfolioId, period),
    staleTime: PERFORMANCE_STALE_TIME,
    gcTime: PERFORMANCE_GC_TIME,
  });
}
