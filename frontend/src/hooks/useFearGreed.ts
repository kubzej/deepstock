import { useQuery } from '@tanstack/react-query';
import { fetchFearGreed } from '@/lib/api/market';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';

export function useFearGreed() {
  return useQuery({
    queryKey: queryKeys.fearGreed(),
    queryFn: fetchFearGreed,
    staleTime: STALE_TIMES.fearGreed,
  });
}
