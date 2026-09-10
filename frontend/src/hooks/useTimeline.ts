import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';
import { fetchTimelinePage } from '@/lib/api/timeline';

const TIMELINE_PAGE_SIZE = 30;

export function useTimeline() {
  return useInfiniteQuery({
    queryKey: queryKeys.timeline(),
    queryFn: ({ pageParam }) => fetchTimelinePage(TIMELINE_PAGE_SIZE, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: STALE_TIMES.timeline,
  });
}
