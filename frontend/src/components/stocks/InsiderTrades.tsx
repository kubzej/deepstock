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
import { formatDateCzech } from '@/lib/format';

interface InsiderTradesProps {
  ticker: string;
}

/**
 * Format large dollar values compactly: $9,375,000 → $9.38M
 */
function formatValue(value: number | null): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
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
  if (trades.length === 0) return null;

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
      {/* Section header */}
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Insider obchody
      </h2>

      {/* Summary bar */}
      <div className="flex gap-6 mb-4 text-sm">
        {buyCount > 0 && (
          <div>
            <span className="text-muted-foreground">Celkem nákupy: </span>
            <span className="font-mono-price font-medium">
              {formatValue(totalBuys)}
            </span>
          </div>
        )}
        {sellCount > 0 && (
          <div>
            <span className="text-muted-foreground">Celkem prodeje: </span>
            <span className="font-mono-price font-medium">
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
              className="bg-muted/30 rounded-xl"
            >
              <div className="px-3 py-2.5">
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  {/* Left: Badge + Name */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-[18px] font-medium"
                      >
                        {isBuy ? 'NÁKUP' : 'PRODEJ'}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {trade.insider_name}
                      </span>
                    </div>
                  </div>

                  {/* Right: Value */}
                  <div className="flex items-baseline gap-1.5 flex-shrink-0">
                    <span className="font-mono-price text-sm font-medium">
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
                      ? ` × $${trade.price_per_share.toFixed(2)}`
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
