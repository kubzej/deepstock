/**
 * InsiderTrades — displays SEC Form 4 insider buy/sell activity.
 *
 * Shown in StockDetail for US stocks. Hidden when no data (non-US).
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInsiderTrades } from '@/hooks/useInsiderTrades';
import { formatDateCzech, formatLargeNumber, formatPrice } from '@/lib/format';

interface InsiderTradesProps {
  ticker: string;
}

/**
 * Format large dollar values compactly: $9,375,000 → $9.38M
 * Insider trades are always USD (SEC filings).
 */
function formatValue(value: number | null): string {
  if (value == null) return '—';
  return `$${formatLargeNumber(Math.abs(value))}`;
}

/**
 * Format share count compactly: 50000 → 50K
 */
function formatShares(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('cs-CZ');
}

const INITIAL_COUNT = 3;

export function InsiderTrades({ ticker }: InsiderTradesProps) {
  const { data, isLoading } = useInsiderTrades(ticker);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  // Don't render anything if loading or no data (non-US stock)
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const trades = data?.trades ?? [];
  if (trades.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Žádné insider obchody za posledních 12 měsíců.
      </div>
    );
  }

  // Summary stats
  const totalBuys = trades
    .filter((t) => t.trade_type === 'Purchase')
    .reduce((sum, t) => sum + (t.total_value ?? 0), 0);
  const totalSells = trades
    .filter((t) => t.trade_type === 'Sale')
    .reduce((sum, t) => sum + (t.total_value ?? 0), 0);
  const buyCount = trades.filter((t) => t.trade_type === 'Purchase').length;
  const sellCount = trades.filter((t) => t.trade_type === 'Sale').length;

  // Show limited rows unless expanded
  const visible = trades.slice(0, visibleCount);
  const hasMore = visibleCount < trades.length;

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {buyCount > 0 && (
          <div>
            <span className="text-muted-foreground">Celkem nákupy: </span>
            <span className="font-mono-price text-foreground/85">
              {formatValue(totalBuys)}
            </span>
          </div>
        )}
        {sellCount > 0 && (
          <div>
            <span className="text-muted-foreground">Celkem prodeje: </span>
            <span className="font-mono-price text-foreground/85">
              {formatValue(totalSells)}
            </span>
          </div>
        )}
      </div>

      {/* Trades list */}
      <div className="space-y-1">
        {visible.map((trade, i) => {
          const isBuy = trade.trade_type === 'Purchase';

          return (
            <div
              key={`${trade.trade_date}-${trade.insider_name}-${i}`}
              className="rounded-xl border border-border/60 bg-muted/18"
            >
              <div className="px-3 py-2.5">
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  {/* Left: Badge + Name */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`h-[18px] px-1.5 py-0 text-[10px] font-medium ${
                          isBuy
                            ? 'border-positive/20 bg-positive/6 text-positive'
                            : 'border-negative/20 bg-negative/6 text-negative'
                        }`}
                      >
                        {isBuy ? 'NÁKUP' : 'PRODEJ'}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {trade.insider_name}
                      </span>
                    </div>
                  </div>

                  {/* Right: Value */}
                  <div className="flex shrink-0 items-baseline gap-1.5">
                    <span className="font-mono-price text-sm text-foreground/90">
                      {formatValue(trade.total_value)}
                    </span>
                  </div>
                </div>

                {/* Subrow: title · date | shares × price */}
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[11px] text-muted-foreground truncate">
                    {trade.insider_title && <>{trade.insider_title} · </>}
                    {formatDateCzech(trade.trade_date)}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono-price flex-shrink-0 ml-2">
                    {formatShares(trade.shares)} ks
                    {trade.price_per_share
                      ? ` × ${formatPrice(trade.price_per_share, 'USD')}`
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-muted-foreground"
          onClick={() =>
            setVisibleCount((prev) => Math.min(prev + 10, trades.length))
          }
        >
          Zobrazit dalších {Math.min(10, trades.length - visibleCount)}
        </Button>
      )}
    </div>
  );
}
