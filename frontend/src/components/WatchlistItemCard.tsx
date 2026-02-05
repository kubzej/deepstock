import { useState } from 'react';
import { Pencil, Trash2, Tag, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Quote, WatchlistItem } from '@/lib/api';
import { formatPrice, formatPercent } from '@/lib/format';

interface WatchlistItemCardProps {
  item: WatchlistItem;
  quote: Quote | null;
  onEdit: () => void;
  onDelete: () => void;
  onTags: () => void;
  onClick?: () => void;
}

export function WatchlistItemCard({
  item,
  quote,
  onEdit,
  onDelete,
  onTags,
  onClick,
}: WatchlistItemCardProps) {
  const [expanded, setExpanded] = useState(false);

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
            <span className="text-[11px] text-muted-foreground truncate block">
              {item.stocks.name}
            </span>
          </div>

          {/* Right: Price + Change */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <span className="font-mono text-sm font-medium block">
                {quote ? formatPrice(quote.price, item.stocks.currency) : '—'}
              </span>
              <span
                className={`text-[10px] font-mono ${
                  isDayPositive ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {quote ? formatPercent(quote.changePercent) : '—'}
              </span>
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
                  className={`font-mono ${atBuyTarget ? 'text-emerald-500 font-semibold' : ''}`}
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
                  className={`font-mono ${atSellTarget ? 'text-amber-500 font-semibold' : ''}`}
                >
                  {item.target_sell_price
                    ? formatPrice(item.target_sell_price, item.stocks.currency)
                    : '—'}
                </span>
              </div>
            </div>

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
