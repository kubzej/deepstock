import { useQuery } from '@tanstack/react-query';
import { fetchExchangeRates } from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Hook for fetching exchange rates.
 * Very long stale time - FX rates change slowly.
 */
export function useExchangeRates() {
  return useQuery({
    queryKey: queryKeys.exchangeRates(),
    queryFn: fetchExchangeRates,
    staleTime: STALE_TIMES.exchangeRates,
    gcTime: GC_TIMES.long,
  });
}
