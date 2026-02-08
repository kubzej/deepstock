/**
 * useInsiderTrades — fetches SEC Form 4 insider transactions for a ticker.
 *
 * Only returns data for US-listed stocks. Non-US tickers get empty trades[].
 * Lazy-loaded on Stock Detail — no prefetch/cron needed.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchInsiderTrades } from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

export function useInsiderTrades(ticker: string | null) {
  return useQuery({
    queryKey: queryKeys.insiderTrades(ticker ?? ''),
    queryFn: () => fetchInsiderTrades(ticker!),
    enabled: !!ticker,
    staleTime: STALE_TIMES.insiderTrades,
    gcTime: GC_TIMES.long,
  });
}
