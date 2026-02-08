/**
 * InsiderTrades — displays SEC Form 4 insider buy/sell activity.
 *
 * Shown in StockDetail for US stocks. Hidden when no data (non-US).
 */
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
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

export function InsiderTrades({ ticker }: InsiderTradesProps) {
  const { data, isLoading } = useInsiderTrades(ticker);
  const [showAll, setShowAll] = useState(false);

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
  const INITIAL_COUNT = 3;
  const visible = showAll ? trades : trades.slice(0, INITIAL_COUNT);
  const hasMore = trades.length > INITIAL_COUNT;

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
      <div className="-mx-2">
        {visible.map((trade, i) => {
          const isBuy = trade.trade_type === 'Purchase';

          return (
            <div
              key={`${trade.trade_date}-${trade.insider_name}-${i}`}
              className="group flex items-start justify-between py-2.5 px-2 rounded-lg hover:bg-muted/40 transition-colors"
            >
              {/* Left: Name, title, date */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {trade.insider_title && (
                    <span className="truncate max-w-[180px]">
                      {trade.insider_title}
                    </span>
                  )}
                  <span>·</span>
                  <span>{formatDateCzech(trade.trade_date)}</span>
                </div>
              </div>

              {/* Right: Value, shares, link */}
              <div className="text-right shrink-0 ml-4">
                <div className="font-mono-price text-sm font-medium">
                  {formatValue(trade.total_value)}
                </div>
                <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                  <span className="font-mono-price">
                    {formatShares(trade.shares)} ks
                    {trade.price_per_share
                      ? ` × $${trade.price_per_share.toFixed(2)}`
                      : ''}
                  </span>
                  <a
                    href={trade.filing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                    title="Zobrazit SEC filing"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
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
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? 'Zobrazit méně'
            : `Zobrazit dalších ${trades.length - INITIAL_COUNT}`}
        </Button>
      )}
    </div>
  );
}
