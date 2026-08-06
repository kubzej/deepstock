import { useState } from 'react';
import { Pencil, Trash2, MoreHorizontal, MoveRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/shared/Sparkline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EarningsCalendarEntry, Quote, WatchlistItem } from '@/lib/api';
import {
  getDaysUntilEarnings,
  shouldShowEarningsBadge,
  shouldShowEarningsTime,
  shouldShowEarningsCallTime,
  formatEarningsBadge,
  formatDateCzech,
  formatTimePrague,
  formatPrice,
  formatPercent,
} from '@/lib/format';
import {
  getWatchlistActiveTarget,
  getWatchlistTargetSummaries,
} from './watchlistSignals';

interface WatchlistItemCardProps {
  item: WatchlistItem;
  quote: Quote | null;
  earnings?: EarningsCalendarEntry | null;
  sparklineData?: number[] | null;
  onEdit: () => void;
  onDelete: () => void;
  onMove?: () => void;
  showMoveOption?: boolean;
  onClick?: () => void;
  showWatchlistName?: boolean;
  watchlistName?: string;
}

export function WatchlistItemCard({
  item,
  quote,
  earnings,
  sparklineData,
  onEdit,
  onDelete,
  onMove,
  showMoveOption = false,
  onClick,
  showWatchlistName,
  watchlistName,
}: WatchlistItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const daysUntil = getDaysUntilEarnings(earnings?.earningsDate);
  const earningsBadge = formatEarningsBadge(daysUntil);
  const showBadge = shouldShowEarningsBadge(daysUntil);
  const lastDaysUntil = getDaysUntilEarnings(earnings?.lastEarningsDate);
  const lastEarningsBadge = formatEarningsBadge(lastDaysUntil);
  const showLastBadge = shouldShowEarningsBadge(lastDaysUntil);
  const showEarningsTime = shouldShowEarningsTime(daysUntil);
  const releaseTime = showEarningsTime ? formatTimePrague(earnings?.earningsTimestamp) : null;
  const showCallTime =
    showEarningsTime && shouldShowEarningsCallTime(earnings?.earningsTimestamp, earnings?.earningsCallTimestamp);
  const callTime = showCallTime ? formatTimePrague(earnings?.earningsCallTimestamp) : null;

  const activeTarget = getWatchlistActiveTarget(item, quote);
  const atBuyTarget = activeTarget === 'buy';
  const atSellTarget = activeTarget === 'sell';
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
              <a
                href={`https://finance.yahoo.com/quote/${item.stocks.ticker}/`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`font-bold text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground ${
                  atBuyTarget
                    ? 'text-positive'
                    : atSellTarget
                      ? 'text-warning'
                      : ''
                }`}
              >
                {item.stocks.ticker}
              </a>
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex h-5 max-w-[120px] items-center gap-1 rounded-full px-1.5 text-[9px] font-medium leading-none"
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
                </div>
              )}
              {showBadge && earningsBadge && (
                <span className="inline-flex items-center gap-0.5 rounded bg-info/15 px-1 py-0.5 text-[9px] font-semibold leading-none text-info">
                  {earningsBadge}
                </span>
              )}
              {showLastBadge && lastEarningsBadge && (
                <span className="inline-flex items-center gap-0.5 rounded bg-muted-foreground/10 px-1 py-0.5 text-[9px] font-semibold leading-none text-muted-foreground">
                  Earnings {lastEarningsBadge}
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
          <div className="flex items-start gap-2 flex-shrink-0">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                <span className="font-mono-price text-base font-semibold">
                  {quote ? formatPrice(quote.price, item.stocks.currency) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <span
                  className={`text-[10px] font-mono-price ${dayChangeTone}`}
                >
                  {quote ? formatPercent(quote.changePercent) : '—'}
                </span>
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
              {target.value !== '—' && (
                <div
                  className={`mt-0.5 text-[10px] leading-tight ${
                    target.active
                      ? target.key === 'buy'
                        ? 'text-positive/70'
                        : 'text-warning/80'
                      : 'text-muted-foreground'
                  }`}
                >
                  {target.detail}
                </div>
              )}
            </div>
          ))}
          {sparklineData && sparklineData.length >= 2 ? (
            <div className="flex min-h-[54px] items-center justify-center px-1 py-1">
              <div className="h-10 w-full max-w-[108px] overflow-hidden opacity-90">
                <Sparkline data={sparklineData} className="h-full w-full" />
              </div>
            </div>
          ) : (
            <div className="min-h-[54px]" />
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
            {earnings?.earningsDate && (
              <div className="text-xs mb-2">
                <span className="text-muted-foreground/70 block">Earnings</span>
                <span>
                  {formatDateCzech(earnings.earningsDate)}
                  {releaseTime && ` v ${releaseTime}`}
                </span>
                {callTime && (
                  <span className="block text-muted-foreground/70">Call: {callTime}</span>
                )}
              </div>
            )}

            {earnings?.lastEarningsDate && (
              <div className="text-xs mb-2">
                <span className="text-muted-foreground/70 block">Poslední earnings</span>
                <span>{formatDateCzech(earnings.lastEarningsDate)}</span>
              </div>
            )}

            {/* Sector / Industry */}
            {(item.stocks.sector || item.stocks.industry) && (
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide mb-2">
                {[item.stocks.sector, item.stocks.industry].filter(Boolean).join(' · ')}
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
