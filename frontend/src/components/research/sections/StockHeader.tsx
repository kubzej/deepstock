import { TrendingDown, TrendingUp } from 'lucide-react';
import type { StockInfo } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/format';

interface StockHeaderProps {
  data: StockInfo;
}

export function StockHeader({ data }: StockHeaderProps) {
  const isPositive = (data.change ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline gap-3">
          <h2 className="text-3xl font-bold">{data.symbol}</h2>
          <span className="text-muted-foreground">{data.exchange}</span>
        </div>
        <p className="text-lg text-muted-foreground">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          {data.sector} · {data.industry}
        </p>
      </div>

      <div className="flex items-baseline gap-4">
        <span className="text-4xl font-mono-price font-bold">
          {formatCurrency(data.price, data.currency ?? 'USD')}
        </span>
        <div
          className={`flex items-center gap-1 text-lg ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}
        >
          {isPositive ? (
            <TrendingUp className="w-5 h-5" />
          ) : (
            <TrendingDown className="w-5 h-5" />
          )}
          <span className="font-mono-price">
            {formatCurrency(data.change, data.currency ?? 'USD')} (
            {formatPercent(data.changePercent)})
          </span>
        </div>
      </div>

      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Denní rozpětí: </span>
          <span className="font-mono-price">
            {formatCurrency(data.dayLow, data.currency ?? 'USD')} —{' '}
            {formatCurrency(data.dayHigh, data.currency ?? 'USD')}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">52T rozpětí: </span>
          <span className="font-mono-price">
            {formatCurrency(data.fiftyTwoWeekLow, data.currency ?? 'USD')} —{' '}
            {formatCurrency(data.fiftyTwoWeekHigh, data.currency ?? 'USD')}
          </span>
        </div>
      </div>
    </div>
  );
}
