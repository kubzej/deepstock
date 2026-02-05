/**
 * Distribution List Component
 * Shows portfolio breakdown with visual bar chart
 */
import { formatPrice, formatPercent } from '@/lib/format';
import type { DistributionItem } from './utils';

interface DistributionListProps {
  title: string;
  items: DistributionItem[];
}

export function DistributionList({ title, items }: DistributionListProps) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium mb-3">{title}</h3>
        <p className="text-sm text-muted-foreground">Žádná data</p>
      </div>
    );
  }

  const maxPercent = Math.max(...items.map((i) => i.percent));

  return (
    <div>
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{item.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground tabular-nums text-xs">
                  {formatPercent(item.percent, 1)}
                </span>
                <span className="font-mono-price text-xs w-20 text-right">
                  {formatPrice(item.value, 'CZK')}
                </span>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-zinc-500"
                style={{
                  width: `${(item.percent / maxPercent) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
