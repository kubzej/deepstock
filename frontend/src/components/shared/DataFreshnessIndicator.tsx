import { useMemo, useState, useEffect } from 'react';
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
 * Re-renders every 30 seconds to keep time display fresh.
 */
export function DataFreshnessIndicator({
  dataUpdatedAt,
  isFetching = false,
  className,
}: DataFreshnessIndicatorProps) {
  // Tick counter to force re-calculation every 30 seconds
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  const text = useMemo(() => {
    // Include tick in closure to satisfy exhaustive-deps
    void tick;

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
  }, [dataUpdatedAt, isFetching, tick]);

  if (!text) return null;

  return (
    <span className={cn('text-xs text-muted-foreground', className)}>
      {text}
    </span>
  );
}
