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

  const atBuyTarget =
    item.target_buy_price && quote
      ? quote.price <= item.target_buy_price
      : false;
  const atSellTarget =
    item.target_sell_price && quote
      ? quote.price >= item.target_sell_price
      : false;

  const isDayPositive = quote && quote.changePercent >= 0;

  const handleClick = () => {
    setExpanded(!expanded);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <div
      className={`bg-muted/30 rounded-xl cursor-pointer active:scale-[0.99] transition-transform ${
        atBuyTarget
          ? 'ring-1 ring-emerald-500/50 bg-emerald-500/5'
          : atSellTarget
            ? 'ring-1 ring-amber-500/50 bg-amber-500/5'
            : ''
      }`}
      onClick={handleClick}
    >
      {/* Main content */}
      <div className="px-3 py-2.5">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          {/* Left: Ticker + Name + Tags */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Signal indicator */}
              {(atBuyTarget || atSellTarget) && (
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      atBuyTarget ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      atBuyTarget ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                </span>
              )}
              <span
                className={`font-bold text-sm ${
                  atBuyTarget
                    ? 'text-emerald-500'
                    : atSellTarget
                      ? 'text-amber-500'
                      : ''
                }`}
              >
                {item.stocks.ticker}
              </span>
              {/* Earnings Badge - show only for -7 to +14 days */}
              {showBadge && earningsBadge && (
                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold leading-none bg-blue-500/15 text-blue-500">
                  <Calendar className="h-2.5 w-2.5" />
                  {earningsBadge}
                </span>
              )}
              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <div className="flex gap-0.5">
                  {item.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium leading-none"
                      style={{
                        backgroundColor: `${tag.color}15`,
                        color: tag.color,
                      }}
                    >
                      <span
                        className="h-1 w-1 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </span>
                  ))}
                  {item.tags.length > 2 && (
                    <span className="text-[9px] text-muted-foreground">
                      +{item.tags.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground truncate">
                {item.stocks.name}
              </span>
              {showWatchlistName && watchlistName && (
                <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                  {watchlistName}
                </span>
              )}
            </div>
          </div>

          {/* Right: Price + Change */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                <span className="font-mono-price text-sm font-medium">
                  {quote ? formatPrice(quote.price, item.stocks.currency) : '—'}
                </span>
                {quote?.preMarketPrice && (
                  <span className="font-mono-price text-[10px] text-orange-500">
                    → {formatPrice(quote.preMarketPrice, item.stocks.currency)}
                  </span>
                )}
                {quote?.postMarketPrice && (
                  <span className="font-mono-price text-[10px] text-violet-500">
                    → {formatPrice(quote.postMarketPrice, item.stocks.currency)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-end gap-1">
                <span
                  className={`text-[10px] font-mono-price ${
                    isDayPositive ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {quote ? formatPercent(quote.changePercent) : '—'}
                </span>
                {quote?.preMarketChangePercent !== undefined &&
                  quote?.preMarketChangePercent !== null && (
                    <span className="font-mono-price text-[10px] text-orange-500">
                      ({formatPercent(quote.preMarketChangePercent)})
                    </span>
                  )}
                {quote?.postMarketChangePercent !== undefined &&
                  quote?.postMarketChangePercent !== null && (
                    <span className="font-mono-price text-[10px] text-violet-500">
                      ({formatPercent(quote.postMarketChangePercent)})
                    </span>
                  )}
              </div>
            </div>

            {/* Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
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

        {/* Expanded Details */}
        <div
          className={`grid transition-all duration-200 ease-out ${
            expanded
              ? 'grid-rows-[1fr] opacity-100 mt-3'
              : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            {/* Targets row */}
            <div className="grid grid-cols-2 gap-3 text-xs mb-2">
              <div>
                <span className="text-muted-foreground/70 block">
                  Nákupní cíl
                </span>
                <span
                  className={`font-mono-price ${atBuyTarget ? 'text-emerald-500 font-semibold' : ''}`}
                >
                  {item.target_buy_price
                    ? formatPrice(item.target_buy_price, item.stocks.currency)
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">
                  Prodejní cíl
                </span>
                <span
                  className={`font-mono-price ${atSellTarget ? 'text-amber-500 font-semibold' : ''}`}
                >
                  {item.target_sell_price
                    ? formatPrice(item.target_sell_price, item.stocks.currency)
                    : '—'}
                </span>
              </div>
            </div>

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
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5 whitespace-pre-wrap">
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
