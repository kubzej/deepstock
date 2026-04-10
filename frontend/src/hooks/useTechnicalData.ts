import { useQuery } from '@tanstack/react-query';
import { fetchTechnicalIndicators, type TechnicalPeriod } from '@/lib/api/market';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';

export function useTechnicalData(ticker: string, period: TechnicalPeriod) {
  return useQuery({
    queryKey: queryKeys.technicalIndicators(ticker, period),
    queryFn: () => fetchTechnicalIndicators(ticker, period),
    staleTime: STALE_TIMES.technicalIndicators,
  });
}
