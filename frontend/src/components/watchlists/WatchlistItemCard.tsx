import { useState, useMemo } from 'react';
import {
  Pencil,
  Trash2,
  Tag,
  MoreHorizontal,
  Calendar,
  MoveRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Quote, WatchlistItem } from '@/lib/api';
import {
  getDaysUntilEarnings,
  shouldShowEarningsBadge,
  formatEarningsBadge,
  formatDateCzech,
  formatPrice,
  formatPercent,
} from '@/lib/format';
import {
  getWatchlistActiveTarget,
  getWatchlistSignalSummary,
  getWatchlistTargetSummaries,
} from './watchlistSignals';

interface WatchlistItemCardProps {
  item: WatchlistItem;
  quote: Quote | null;
  onEdit: () => void;
  onDelete: () => void;
  onTags: () => void;
  onMove?: () => void;
  showMoveOption?: boolean;
  onClick?: () => void;
  showWatchlistName?: boolean;
  watchlistName?: string;
}

export function WatchlistItemCard({
  item,
  quote,
  onEdit,
  onDelete,
  onTags,
  onMove,
  showMoveOption = false,
  onClick,
  showWatchlistName,
  watchlistName,
}: WatchlistItemCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Calculate earnings data from quote.earningsDate
  const daysUntil = useMemo(
    () => getDaysUntilEarnings(quote?.earningsDate),
    [quote?.earningsDate],
  );
  const earningsBadge = formatEarningsBadge(daysUntil);
  const showBadge = shouldShowEarningsBadge(daysUntil);

  const activeTarget = getWatchlistActiveTarget(item, quote);
  const atBuyTarget = activeTarget === 'buy';
  const atSellTarget = activeTarget === 'sell';
  const signal = getWatchlistSignalSummary(item, quote);
  const targetSummaries = getWatchlistTargetSummaries(item, quote);

  const dayChangeTone = quote
    ? quote.changePercent > 0
      ? 'text-positive'
      : quote.changePercent < 0
        ? 'text-negative'
        : ''
    : '';

  const handleClick = () => {
    setExpanded(!expanded);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <div
      className={`cursor-pointer rounded-xl transition-transform active:scale-[0.99] ${
        atBuyTarget
          ? 'bg-positive/10'
          : atSellTarget
            ? 'bg-warning/14'
            : 'bg-muted/40'
      }`}
      onClick={handleClick}
    >
      {/* Main content */}
      <div className="px-3 py-2.5">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`font-bold text-sm ${
                  atBuyTarget
                    ? 'text-positive'
                    : atSellTarget
                      ? 'text-warning'
                      : ''
                }`}
              >
                {item.stocks.ticker}
              </span>
              {item.tags && item.tags.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  {item.tags.slice(0, 1).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex h-5 max-w-[72px] items-center gap-1 rounded-full px-1.5 text-[9px] font-medium leading-none truncate"
                      style={{
                        backgroundColor: `${tag.color}15`,
                        color: tag.color,
                      }}
                    >
                      <span
                        className="h-1 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </span>
                  ))}
                  {item.tags.length > 1 && (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-1.5 text-[9px] text-muted-foreground">
                      +{item.tags.length - 1}
                    </span>
                  )}
                </div>
              )}
              {/* Earnings Badge - show only for -7 to +14 days */}
              {showBadge && earningsBadge && (
                <span className="inline-flex items-center gap-0.5 rounded bg-info/15 px-1 py-0.5 text-[9px] font-semibold leading-none text-info">
                  <Calendar className="h-2.5 w-2.5" />
                  {earningsBadge}
                </span>
              )}
              {showWatchlistName && watchlistName && (
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {watchlistName}
                </span>
              )}
            </div>
            <div className="min-w-0 text-[11px] text-muted-foreground truncate">
              {item.stocks.name}
            </div>
          </div>

          {/* Right: Price + Change */}
          <div className="flex items-start gap-1.5 flex-shrink-0">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                <span className="font-mono-price text-base font-semibold">
                  {quote ? formatPrice(quote.price, item.stocks.currency) : '—'}
                </span>
                {quote?.preMarketPrice && (
                  <span className="font-mono-price text-[10px] text-warning">
                    → {formatPrice(quote.preMarketPrice, item.stocks.currency)}
                  </span>
                )}
                {quote?.postMarketPrice && (
                  <span className="font-mono-price text-[10px] text-info">
                    → {formatPrice(quote.postMarketPrice, item.stocks.currency)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-end gap-1">
                <span
                  className={`text-[10px] font-mono-price ${dayChangeTone}`}
                >
                  {quote ? formatPercent(quote.changePercent) : '—'}
                </span>
                {quote?.preMarketChangePercent !== undefined &&
                  quote?.preMarketChangePercent !== null && (
                    <span className="font-mono-price text-[10px] text-warning">
                      ({formatPercent(quote.preMarketChangePercent)})
                    </span>
                  )}
                {quote?.postMarketChangePercent !== undefined &&
                  quote?.postMarketChangePercent !== null && (
                    <span className="font-mono-price text-[10px] text-info">
                      ({formatPercent(quote.postMarketChangePercent)})
                    </span>
                  )}
              </div>
            </div>

            {/* Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Upravit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onTags();
                  }}
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Tagy
                </DropdownMenuItem>
                {showMoveOption && onMove && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove();
                    }}
                  >
                    <MoveRight className="h-4 w-4 mr-2" />
                    Přesunout
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Odebrat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.2fr] items-start gap-2">
          {targetSummaries.map((target) => (
            <div
              key={target.key}
              className={`min-w-0 rounded-lg px-2 py-1 ${
                target.active
                  ? target.key === 'buy'
                    ? 'bg-positive/10'
                    : 'bg-warning/10'
                  : 'bg-background/75'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {target.label}
              </div>
              <div
                className={`font-mono-price text-xs font-semibold ${
                  target.active
                    ? target.key === 'buy'
                      ? 'text-positive'
                      : 'text-warning'
                    : ''
                }`}
              >
                {target.value}
              </div>
            </div>
          ))}
          {signal.label !== 'Bez cíle' ? (
            <div className="min-w-0 self-center text-[10px] leading-tight text-muted-foreground">
              {signal.detail}
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* Expanded Details */}
        <div
          className={`grid transition-all duration-200 ease-out ${
            expanded
              ? 'grid-rows-[1fr] opacity-100 mt-2'
              : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            {/* Earnings */}
            {quote?.earningsDate && (
              <div className="text-xs mb-2">
                <span className="text-muted-foreground/70 block">Earnings</span>
                <span>{formatDateCzech(quote.earningsDate)}</span>
              </div>
            )}

            {/* Sector */}
            {(item.sector || item.stocks.sector) && (
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide mb-2">
                {item.sector || item.stocks.sector}
              </p>
            )}

            {/* Notes */}
            {item.notes && (
              <p className="rounded-md bg-background/80 px-2 py-1.5 whitespace-pre-wrap text-xs text-muted-foreground">
                {item.notes}
              </p>
            )}

            {/* Navigate button */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={handleNavigate}
            >
              Zobrazit detail
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
