/**
 * Metric Display Component
 * Simple label + value for stats
 */
import { formatPrice, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MetricProps {
  label: string;
  value: number;
  format?: 'currency' | 'percent' | 'number';
  colored?: boolean;
}

export function Metric({
  label,
  value,
  format = 'currency',
  colored = true,
}: MetricProps) {
  const formattedValue =
    format === 'currency'
      ? formatPrice(value, 'CZK')
      : format === 'percent'
        ? formatPercent(value, 1)
        : formatNumber(value);

  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn(
          'text-lg font-mono-price font-medium',
          colored && value > 0 && 'text-emerald-500',
          colored && value < 0 && 'text-rose-500',
          !colored && 'text-foreground',
        )}
      >
        {formattedValue}
      </p>
    </div>
  );
}
