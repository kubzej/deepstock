/**
 * WatchlistItemsTable - Desktop table view for watchlist items
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  MoveRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import {
  type WatchlistItem,
  type WatchlistItemWithSource,
  type Quote,
} from '@/lib/api';
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
} from './watchlistSignals';

export type SortKey =
  | 'ticker'
  | 'price'
  | 'change'
  | 'buyTarget'
  | 'sellTarget'
  | 'earnings'
  | 'sector';
export type SortDir = 'asc' | 'desc';

interface WatchlistItemsTableProps {
  items: WatchlistItem[];
  quotes: Record<string, Quote>;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onEdit: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
  onMove: (item: WatchlistItem) => void;
  onTagsEdit: (item: WatchlistItem) => void;
  showMoveOption?: boolean;
  showWatchlistName?: boolean;
}

// Sort icon helper
function SortIcon({
  columnKey,
  currentKey,
  currentDir,
}: {
  columnKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
}) {
  if (currentKey !== columnKey) {
    return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-30" />;
  }
  return currentDir === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3 inline" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3 inline" />
  );
}

export function WatchlistItemsTable({
  items,
  quotes,
  sortKey,
  sortDir,
  onSort,
  onEdit,
  onDelete,
  onMove,
  onTagsEdit,
  showMoveOption = true,
  showWatchlistName = false,
}: WatchlistItemsTableProps) {
  const navigate = useNavigate();

  return (
    <div className="hidden md:block overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead
              className="text-xs uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => onSort('ticker')}
            >
              Ticker{' '}
              <SortIcon
                columnKey="ticker"
                currentKey={sortKey}
                currentDir={sortDir}
              />
            </TableHead>
            <TableHead
              className="text-xs uppercase tracking-wide text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => onSort('price')}
            >
              Cena{' '}
              <SortIcon
                columnKey="price"
                currentKey={sortKey}
                currentDir={sortDir}
              />
            </TableHead>
            <TableHead
              className="text-xs uppercase tracking-wide text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => onSort('change')}
            >
              Změna{' '}
              <SortIcon
                columnKey="change"
                currentKey={sortKey}
                currentDir={sortDir}
              />
            </TableHead>
            <TableHead
              className="text-xs uppercase tracking-wide text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => onSort('buyTarget')}
            >
              Nákup{' '}
              <SortIcon
                columnKey="buyTarget"
                currentKey={sortKey}
                currentDir={sortDir}
              />
            </TableHead>
            <TableHead
              className="text-xs uppercase tracking-wide text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => onSort('sellTarget')}
            >
              Prodej{' '}
              <SortIcon
                columnKey="sellTarget"
                currentKey={sortKey}
                currentDir={sortDir}
              />
            </TableHead>
            <TableHead
              className="text-xs uppercase tracking-wide text-muted-foreground text-center cursor-pointer hover:text-foreground transition-colors select-none hidden lg:table-cell"
              onClick={() => onSort('earnings')}
            >
              Earnings{' '}
              <SortIcon
                columnKey="earnings"
                currentKey={sortKey}
                currentDir={sortDir}
              />
            </TableHead>
            <TableHead
              className="text-xs uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none hidden md:table-cell"
              onClick={() => onSort('sector')}
            >
              Sektor{' '}
              <SortIcon
                columnKey="sector"
                currentKey={sortKey}
                currentDir={sortDir}
              />
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground hidden lg:table-cell">
              Poznámka
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const quote = quotes[item.stocks.ticker];
            const activeTarget = getWatchlistActiveTarget(item, quote);
            const atBuy = activeTarget === 'buy';
            const atSell = activeTarget === 'sell';
            const daysUntil = getDaysUntilEarnings(quote?.earningsDate);
            const earningsBadge = formatEarningsBadge(daysUntil);
            const showBadge = shouldShowEarningsBadge(daysUntil);

            return (
              <TableRow
                key={item.id}
                className={`cursor-pointer border-b border-border/60 hover:bg-muted/35 ${
                  atBuy
                    ? 'bg-positive/5'
                    : atSell
                      ? 'bg-warning/10'
                      : ''
                }`}
                onClick={() => navigate({ to: '/stocks/$ticker', params: { ticker: item.stocks.ticker } })}
              >
                <TableCell>
                  <div className="flex items-start gap-2 py-1">
                    {/* Signal indicator */}
                    {(atBuy || atSell) && (
                      <span className="mt-1.5 flex h-2.5 w-2.5 shrink-0 rounded-full">
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${
                            atBuy ? 'bg-positive' : 'bg-warning'
                          }`}
                        />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`font-bold ${
                            atBuy
                              ? 'text-positive'
                              : atSell
                                ? 'text-warning'
                                : ''
                          }`}
                        >
                          {item.stocks.ticker}
                        </span>
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {item.tags.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex max-w-[96px] items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
                                style={{
                                  backgroundColor: `${tag.color}15`,
                                  color: tag.color,
                                }}
                              >
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: tag.color }}
                                />
                                <span className="truncate">{tag.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {showWatchlistName &&
                          (item as WatchlistItemWithSource).watchlist_name && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {(item as WatchlistItemWithSource).watchlist_name}
                            </span>
                          )}
                      </div>
                      <div className="mt-0.5">
                        <span className="text-xs text-muted-foreground truncate block max-w-[220px]">
                          {item.stocks.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono-price">
                  <div>
                    {quote
                      ? formatPrice(quote.price, item.stocks.currency)
                      : '—'}
                    {quote?.preMarketPrice && (
                      <div className="text-[10px] text-warning">
                        {formatPrice(
                          quote.preMarketPrice,
                          item.stocks.currency,
                        )}
                      </div>
                    )}
                    {quote?.postMarketPrice && (
                      <div className="text-[10px] text-info">
                        {formatPrice(
                          quote.postMarketPrice,
                          item.stocks.currency,
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono-price">
                  <div>
                    <span
                      className={
                        quote && quote.changePercent > 0
                          ? 'text-positive'
                          : quote && quote.changePercent < 0
                            ? 'text-negative'
                            : ''
                      }
                    >
                      {quote ? formatPercent(quote.changePercent) : '—'}
                    </span>
                    {quote?.preMarketChangePercent !== undefined &&
                      quote?.preMarketChangePercent !== null && (
                        <div className="text-[10px] text-warning">
                          {formatPercent(quote.preMarketChangePercent)}
                        </div>
                      )}
                    {quote?.postMarketChangePercent !== undefined &&
                      quote?.postMarketChangePercent !== null && (
                        <div className="text-[10px] text-info">
                          {formatPercent(quote.postMarketChangePercent)}
                        </div>
                      )}
                  </div>
                </TableCell>
                <TableCell
                  className={`text-right font-mono-price ${
                    atBuy
                      ? 'text-positive font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {item.target_buy_price
                    ? formatPrice(item.target_buy_price, item.stocks.currency)
                    : '—'}
                </TableCell>
                <TableCell
                  className={`text-right font-mono-price ${
                    atSell
                      ? 'text-warning font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {item.target_sell_price
                    ? formatPrice(item.target_sell_price, item.stocks.currency)
                    : '—'}
                </TableCell>
                <TableCell className="text-center hidden lg:table-cell">
                  {quote?.earningsDate ? (
                    <div>
                      {showBadge && (
                        <div className="text-xs font-semibold text-info">
                          {earningsBadge}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        {formatDateCzech(quote.earningsDate)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                  {item.sector || item.stocks.sector || '—'}
                </TableCell>
                <TableCell className="text-sm hidden lg:table-cell max-w-[150px]">
                  {item.notes ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground truncate block cursor-help">
                          {item.notes}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[300px] whitespace-pre-wrap"
                      >
                        {item.notes}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(item)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Upravit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTagsEdit(item)}>
                        <Tag className="h-4 w-4 mr-2" />
                        Tagy
                      </DropdownMenuItem>
                      {showMoveOption && (
                        <DropdownMenuItem onClick={() => onMove(item)}>
                          <MoveRight className="h-4 w-4 mr-2" />
                          Přesunout
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(item)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Odebrat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
