/**
 * Options Trades - Compact modern card list
 */
import { useMemo } from 'react';
import type { OptionHolding } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/format';
import { X, Trash2, TrendingUp, MessageSquare } from 'lucide-react';

interface OptionsTradesProps {
  holdings: OptionHolding[];
  /** Close position (add closing transaction) */
  onClose?: (holding: OptionHolding) => void;
  /** Delete the position (all transactions) */
  onDelete?: (holding: OptionHolding) => void;
  /** Add new option callback */
  onAddOption?: () => void;
}

// ============ Utility Functions ============

function formatPrice(value: number | null, decimals = 2): string {
  if (value === null) return '—';
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatUSD(value: number | null): string {
  if (value === null) return '—';
  return `$${formatPrice(value)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
  });
}

function getDaysPassed(transactionDate: string | null): number | null {
  if (!transactionDate) return null;
  const now = new Date();
  const start = new Date(transactionDate);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// ============ Main Component ============

export function OptionsTrades({
  holdings,
  onClose,
  onDelete,
  onAddOption,
}: OptionsTradesProps) {
  const enrichedHoldings = useMemo(() => {
    return holdings.map((h) => {
      const isShort = h.position === 'short';
      const premium = h.avg_premium || 0;
      const currentPrice = h.current_price;

      // P/L calculation
      let pl: number | null = null;
      if (currentPrice !== null && premium > 0) {
        pl = isShort
          ? (premium - currentPrice) * h.contracts * 100
          : (currentPrice - premium) * h.contracts * 100;
      }

      // Price change %
      let priceChangePercent: number | null = null;
      if (currentPrice !== null && premium > 0) {
        priceChangePercent = ((currentPrice - premium) / premium) * 100;
      }

      // Break-even
      let breakeven: number | null = null;
      if (premium > 0) {
        breakeven =
          h.option_type === 'call'
            ? h.strike_price + premium
            : h.strike_price - premium;
      }

      // Distance to break-even %
      let breakevenDistance: number | null = null;
      if (breakeven !== null && h.underlying_price !== null) {
        breakevenDistance =
          h.option_type === 'call'
            ? ((breakeven - h.underlying_price) / h.underlying_price) * 100
            : ((h.underlying_price - breakeven) / h.underlying_price) * 100;
      }

      // Days calculation
      const totalDays = h.dte + (getDaysPassed(h.first_transaction) || 0);

      return {
        ...h,
        pl,
        priceChangePercent,
        breakeven,
        breakevenDistance,
        totalDays,
      };
    });
  }, [holdings]);

  if (holdings.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Žádné otevřené opční pozice"
        description="Přidejte první opční transakci pro sledování vašich opcí."
        action={
          onAddOption
            ? { label: 'Přidat opci', onClick: onAddOption }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {enrichedHoldings.map((h) => {
        const isShort = h.position === 'short';
        const isITM = h.moneyness === 'ITM';

        return (
          <div key={h.option_symbol} className="rounded-lg bg-muted/30 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono-price text-lg font-semibold">
                  {h.symbol}
                </span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {isShort ? 'Short' : 'Long'}{' '}
                  {h.option_type === 'call' ? 'Call' : 'Put'} · {h.contracts}×
                </span>
              </div>

              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => onClose?.(h)}
                  title="Zavřít pozici"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive/80"
                  onClick={() => onDelete?.(h)}
                  title="Smazat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Data Grid */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-4 text-sm">
              {/* Strike + Underlying */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Strike
                </div>
                <div className="font-mono-price font-medium">
                  {formatUSD(h.strike_price)}
                </div>
                {h.underlying_price !== null && (
                  <div className="text-[10px] text-muted-foreground">
                    {formatUSD(h.underlying_price)}
                    {h.buffer_percent !== null && (
                      <span
                        className={cn(
                          'ml-1',
                          isITM
                            ? 'text-rose-500'
                            : h.buffer_percent > 10
                              ? 'text-emerald-500'
                              : 'text-amber-500',
                        )}
                      >
                        {formatPercent(
                          isShort ? h.buffer_percent : -h.buffer_percent,
                          1,
                          true,
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Premium + Current */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Premium
                </div>
                <div className="font-mono-price font-medium">
                  {formatUSD(h.avg_premium)}
                </div>
                {h.current_price !== null && (
                  <div className="text-[10px]">
                    <span className="text-muted-foreground">
                      {formatUSD(h.current_price)}
                    </span>
                    {h.priceChangePercent !== null && (
                      <span
                        className={cn(
                          'ml-1',
                          (
                            isShort
                              ? h.priceChangePercent <= 0
                              : h.priceChangePercent >= 0
                          )
                            ? 'text-emerald-500'
                            : 'text-rose-500',
                        )}
                      >
                        {formatPercent(h.priceChangePercent, 1, true)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Expiration */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Expirace
                </div>
                <div
                  className={cn(
                    'font-mono-price font-medium',
                    h.dte < 0
                      ? 'text-muted-foreground'
                      : h.dte <= 7
                        ? 'text-rose-500'
                        : h.dte <= 21
                          ? 'text-amber-500'
                          : '',
                  )}
                >
                  {h.dte < 0 ? 'Exp.' : `${h.dte} dní`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatDate(h.expiration_date)}
                  {h.totalDays > 0 && <span> · z {h.totalDays} dní</span>}
                </div>
              </div>

              {/* P/L */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  P/L
                </div>
                {h.pl !== null ? (
                  <div
                    className={cn(
                      'font-mono-price font-medium',
                      h.pl >= 0 ? 'text-emerald-500' : 'text-rose-500',
                    )}
                  >
                    {h.pl >= 0 ? '+' : ''}
                    {formatUSD(h.pl)}
                  </div>
                ) : (
                  <div className="text-muted-foreground">—</div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  {h.moneyness || 'OTM'}
                </div>
              </div>

              {/* Break-even */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Break-even
                </div>
                {h.breakeven !== null ? (
                  <>
                    <div className="font-mono-price font-medium">
                      {formatUSD(h.breakeven)}
                    </div>
                    {h.breakevenDistance !== null && (
                      <div className="text-[10px]">
                        <span
                          className={cn(
                            isShort
                              ? h.breakevenDistance >= 0
                                ? 'text-emerald-500'
                                : 'text-rose-500'
                              : h.breakevenDistance <= 0
                                ? 'text-emerald-500'
                                : 'text-rose-500',
                          )}
                        >
                          {formatPercent(h.breakevenDistance, 1, true)}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground">—</div>
                )}
              </div>
            </div>

            {/* Notes */}
            {h.notes && (
              <div className="mt-3 pt-3 border-t border-border/40 flex items-start gap-2 text-xs text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{h.notes}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
