import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Quote } from '@/lib/api';
import { formatCurrency, formatPercent, formatPrice } from '@/lib/format';

interface StockCardProps {
  ticker: string;
  name?: string;
  quote: Quote | null;
  shares?: number;
  avgCost?: number;
  valueCzk?: number;
  investedCzk?: number;
  portfolioName?: string;
  onClick?: () => void;
}

export function StockCard({
  ticker,
  name,
  quote,
  shares,
  avgCost,
  valueCzk,
  investedCzk,
  portfolioName,
  onClick,
}: StockCardProps) {
  const isDayPositive = quote && quote.changePercent >= 0;
  const plCzk = valueCzk && investedCzk ? valueCzk - investedCzk : 0;
  const plPercent = investedCzk ? (plCzk / investedCzk) * 100 : 0;
  const isPositive = plCzk >= 0;

  return (
    <Card
      className="border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Top Row: Main Info */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
              {ticker[0]}
            </div>
            <div>
              <h3 className="font-bold text-base">{ticker}</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                {name || ticker}
              </p>
              {portfolioName && (
                <p className="text-xs text-muted-foreground/70 truncate max-w-[120px]">
                  {portfolioName}
                </p>
              )}
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono-price text-base font-medium">
              ${formatPrice(quote?.price)}
            </div>
            <Badge
              variant="outline"
              className={
                isDayPositive
                  ? 'text-positive border-positive/20'
                  : 'text-negative border-negative/20'
              }
            >
              {formatPercent(quote?.changePercent, 2, true)}
            </Badge>
          </div>
        </div>

        {/* Show position details if we have shares */}
        {shares && valueCzk !== undefined && (
          <>
            <div className="h-px bg-border my-3" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {shares} ks × ${formatPrice(avgCost)}
              </span>
              <span className="font-mono-price text-foreground">
                {formatCurrency(valueCzk)}
              </span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Zisk/Ztráta</span>
              <span
                className={`font-mono-price ${isPositive ? 'text-positive' : 'text-negative'}`}
              >
                {formatCurrency(plCzk)} ({formatPercent(plPercent, 1, true)})
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
