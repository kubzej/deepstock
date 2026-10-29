import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LoadMoreFooterProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** The last attempt to load the next page failed. */
  isError: boolean;
  fetchNextPage: () => unknown;
}

/**
 * Sentinel under a paginated entry list: loads the next page when it scrolls into view and shows
 * progress or a failed attempt with a retry. After a failure it waits for the button instead of
 * retrying on its own.
 */
export function LoadMoreFooter({ hasNextPage, isFetchingNextPage, isError, fetchNextPage }: LoadMoreFooterProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage || isError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void fetchNextPage();
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  return (
    <div ref={sentinelRef} className="py-2">
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-center gap-3 py-4 text-sm text-muted-foreground">
          <span>Další záznamy se nepodařilo načíst.</span>
          <Button size="sm" variant="outline" onClick={() => void fetchNextPage()}>
            Zkusit znovu
          </Button>
        </div>
      )}
    </div>
  );
}
