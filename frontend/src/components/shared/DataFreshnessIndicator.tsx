import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DataFreshnessIndicatorProps {
  /** Timestamp when data was last updated (epoch ms or Date) */
  dataUpdatedAt: number | Date | null;
  /** Whether data is currently being fetched */
  isFetching?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Simple text showing how old the data is.
 * "Aktualizuji..." when fetching, otherwise "X min" or "Xh Ym".
 */
export function DataFreshnessIndicator({
  dataUpdatedAt,
  isFetching = false,
  className,
}: DataFreshnessIndicatorProps) {
  const text = useMemo(() => {
    if (isFetching) {
      return 'Aktualizuji...';
    }

    if (!dataUpdatedAt) {
      return null;
    }

    const updatedAtMs =
      dataUpdatedAt instanceof Date ? dataUpdatedAt.getTime() : dataUpdatedAt;
    const ageMs = Date.now() - updatedAtMs;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);

    if (ageMinutes < 1) {
      return 'Právě teď';
    }

    if (ageHours >= 1) {
      const hours = Math.floor(ageHours);
      const mins = ageMinutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }

    return `${ageMinutes} min`;
  }, [dataUpdatedAt, isFetching]);

  if (!text) return null;

  return (
    <span
      className={cn('text-xs text-muted-foreground', className)}
    >
      {text}
    </span>
  );
}
