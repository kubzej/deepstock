import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/format';

interface DistributionItem {
  label: string;
  value: number; // CZK value
  percentage: number;
  color?: string;
}

interface PortfolioDistributionProps {
  items: DistributionItem[];
  title?: string;
}

// Color palette for distribution bars
const COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
];

export function PortfolioDistribution({
  items,
  title = 'Rozložení portfolia',
}: PortfolioDistributionProps) {
  if (items.length === 0) {
    return null;
  }

  // Sort by percentage descending
  const sortedItems = [...items].sort((a, b) => b.percentage - a.percentage);

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Horizontal bar visualization */}
        <div className="h-4 rounded-full overflow-hidden flex mb-4">
          {sortedItems.map((item, i) => (
            <div
              key={item.label}
              className={`${item.color || COLORS[i % COLORS.length]} transition-all`}
              style={{ width: `${item.percentage}%` }}
              title={`${item.label}: ${formatPercent(item.percentage, 1)}`}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="space-y-2">
          {sortedItems.map((item, i) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-sm ${item.color || COLORS[i % COLORS.length]}`}
                />
                <span className="text-sm">{item.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {formatCurrency(item.value)}
                </span>
                <span className="text-sm font-mono-price w-12 text-right">
                  {formatPercent(item.percentage, 1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
