import { useQuery } from '@tanstack/react-query';
import { fetchExchangeRates, DEFAULT_RATES } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook for fetching exchange rates.
 * Rates are cached for 30 minutes as they don't change frequently.
 */
export function useExchangeRates() {
  return useQuery({
    queryKey: queryKeys.exchangeRates(),
    queryFn: fetchExchangeRates,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    placeholderData: DEFAULT_RATES,
  });
}
