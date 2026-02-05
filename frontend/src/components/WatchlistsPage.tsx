import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  MoveRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Eye,
  Target,
  Tag,
} from 'lucide-react';
import { type WatchlistItem, type Quote } from '@/lib/api';
import { formatPrice, formatPercent } from '@/lib/format';
import { useQuotes } from '@/hooks/useQuotes';
import { useQueryClient } from '@tanstack/react-query';
import {
  useWatchlists,
  useWatchlistItems,
  useAddWatchlistItem,
  useUpdateWatchlistItem,
  useDeleteWatchlistItem,
  useMoveWatchlistItem,
} from '@/hooks/useWatchlists';
import { useWatchlistTags, useSetItemTags } from '@/hooks/useWatchlistTags';
import { WatchlistItemCard } from '@/components/WatchlistItemCard';

type SortKey =
  | 'ticker'
  | 'price'
  | 'change'
  | 'buyTarget'
  | 'sellTarget'
  | 'sector';
type SortDir = 'asc' | 'desc';

interface WatchlistsPageProps {
  onStockClick?: (ticker: string) => void;
}

export function WatchlistsPage({ onStockClick }: WatchlistsPageProps) {
  const queryClient = useQueryClient();

  // React Query hooks
  const {
    data: watchlists = [],
    isLoading: loading,
    error: watchlistsError,
  } = useWatchlists();
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(
    null,
  );

  // Auto-select first watchlist
  useEffect(() => {
    if (watchlists.length > 0 && !selectedWatchlistId) {
      setSelectedWatchlistId(watchlists[0].id);
    }
  }, [watchlists, selectedWatchlistId]);

  const { data: items = [], isLoading: itemsLoading } =
    useWatchlistItems(selectedWatchlistId);

  // Get tickers from items for quotes
  const tickers = useMemo(
    () => items.map((item) => item.stocks.ticker),
    [items],
  );
  const { data: quotes = {}, isFetching: quotesLoading } = useQuotes(tickers);

  // Tags
  const { data: allTags = [] } = useWatchlistTags();
  const setItemTagsMutation = useSetItemTags();

  // Mutations
  const addItemMutation = useAddWatchlistItem();
  const updateItemMutation = useUpdateWatchlistItem();
  const deleteItemMutation = useDeleteWatchlistItem();
  const moveItemMutation = useMoveWatchlistItem();

  const error = watchlistsError ? (watchlistsError as Error).message : null;

  // Dialogs
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [deleteItemData, setDeleteItemData] = useState<WatchlistItem | null>(
    null,
  );
  const [moveItemData, setMoveItemData] = useState<WatchlistItem | null>(null);
  const [tagsDialogItem, setTagsDialogItem] = useState<WatchlistItem | null>(
    null,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Form state
  const [itemTicker, setItemTicker] = useState('');
  const [itemBuyTarget, setItemBuyTarget] = useState('');
  const [itemSellTarget, setItemSellTarget] = useState('');
  const [itemNotes, setItemNotes] = useState('');
  const [itemSector, setItemSector] = useState('');
  const [itemSaving, setItemSaving] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const selectedWatchlist = watchlists.find(
    (w) => w.id === selectedWatchlistId,
  );

  // Sorting
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' || key === 'sector' ? 'asc' : 'desc');
    }
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortKey) {
        case 'ticker':
          aVal = a.stocks.ticker;
          bVal = b.stocks.ticker;
          break;
        case 'price':
          aVal = quotes[a.stocks.ticker]?.price ?? 0;
          bVal = quotes[b.stocks.ticker]?.price ?? 0;
          break;
        case 'change':
          aVal = quotes[a.stocks.ticker]?.changePercent ?? 0;
          bVal = quotes[b.stocks.ticker]?.changePercent ?? 0;
          break;
        case 'buyTarget':
          aVal = a.target_buy_price ?? Infinity;
          bVal = b.target_buy_price ?? Infinity;
          break;
        case 'sellTarget':
          aVal = a.target_sell_price ?? -Infinity;
          bVal = b.target_sell_price ?? -Infinity;
          break;
        case 'sector':
          aVal = a.sector ?? a.stocks.sector ?? '';
          bVal = b.sector ?? b.stocks.sector ?? '';
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const numA = aVal as number;
      const numB = bVal as number;
      return sortDir === 'asc' ? numA - numB : numB - numA;
    });
  }, [items, quotes, sortKey, sortDir]);

  // Item CRUD
  const openAddItem = () => {
    setEditingItem(null);
    setItemTicker('');
    setItemBuyTarget('');
    setItemSellTarget('');
    setItemNotes('');
    setItemSector('');
    setAddItemDialogOpen(true);
  };

  const openEditItem = (item: WatchlistItem) => {
    setEditingItem(item);
    setItemTicker(item.stocks.ticker);
    setItemBuyTarget(item.target_buy_price?.toString() || '');
    setItemSellTarget(item.target_sell_price?.toString() || '');
    setItemNotes(item.notes || '');
    setItemSector(item.sector || item.stocks.sector || '');
    setAddItemDialogOpen(true);
  };

  const handleSaveItem = async () => {
    if (!selectedWatchlistId) return;

    setItemSaving(true);
    try {
      if (editingItem) {
        await updateItemMutation.mutateAsync({
          itemId: editingItem.id,
          watchlistId: selectedWatchlistId,
          targetBuyPrice: itemBuyTarget ? parseFloat(itemBuyTarget) : null,
          targetSellPrice: itemSellTarget ? parseFloat(itemSellTarget) : null,
          notes: itemNotes.trim() || null,
          sector: itemSector.trim() || null,
        });
      } else {
        if (!itemTicker.trim()) return;
        await addItemMutation.mutateAsync({
          watchlistId: selectedWatchlistId,
          ticker: itemTicker.trim().toUpperCase(),
          targetBuyPrice: itemBuyTarget ? parseFloat(itemBuyTarget) : undefined,
          targetSellPrice: itemSellTarget
            ? parseFloat(itemSellTarget)
            : undefined,
          notes: itemNotes.trim() || undefined,
          sector: itemSector.trim() || undefined,
        });
      }
      setAddItemDialogOpen(false);
    } catch (err) {
      console.error('Failed to save item:', err);
      alert(err instanceof Error ? err.message : 'Nepodařilo se uložit');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItemData || !selectedWatchlistId) return;

    setItemSaving(true);
    try {
      await deleteItemMutation.mutateAsync({
        itemId: deleteItemData.id,
        watchlistId: selectedWatchlistId,
      });
      setDeleteItemData(null);
    } catch (err) {
      console.error('Failed to delete item:', err);
    } finally {
      setItemSaving(false);
    }
  };

  const handleMoveItem = async (targetWatchlistId: string) => {
    if (!moveItemData || !selectedWatchlistId) return;

    try {
      await moveItemMutation.mutateAsync({
        itemId: moveItemData.id,
        fromWatchlistId: selectedWatchlistId,
        toWatchlistId: targetWatchlistId,
      });
      setMoveItemData(null);
    } catch (err) {
      console.error('Failed to move item:', err);
      alert(err instanceof Error ? err.message : 'Nepodařilo se přesunout');
    }
  };

  // Tags dialog
  const openTagsDialog = (item: WatchlistItem) => {
    setTagsDialogItem(item);
    setSelectedTagIds(item.tags?.map((t) => t.id) || []);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  };

  const handleSaveTags = async () => {
    if (!tagsDialogItem || !selectedWatchlistId) return;

    try {
      await setItemTagsMutation.mutateAsync({
        itemId: tagsDialogItem.id,
        tagIds: selectedTagIds,
      });
      // Invalidate watchlist items to refresh tags
      queryClient.invalidateQueries({
        queryKey: ['watchlistItems', selectedWatchlistId],
      });
      setTagsDialogItem(null);
    } catch (err) {
      console.error('Failed to save tags:', err);
      alert(err instanceof Error ? err.message : 'Nepodařilo se uložit tagy');
    }
  };

  // Helper: check if price is at target
  const isAtBuyTarget = (item: WatchlistItem, quote?: Quote) => {
    if (!item.target_buy_price || !quote) return false;
    return quote.price <= item.target_buy_price;
  };

  const isAtSellTarget = (item: WatchlistItem, quote?: Quote) => {
    if (!item.target_sell_price || !quote) return false;
    return quote.price >= item.target_sell_price;
  };

  // Sort icon helper
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-30" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3 inline" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 inline" />
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-64 w-48" />
          <Skeleton className="h-64 flex-1" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div>
        <div className="text-destructive">{error}</div>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="mt-4"
        >
          Zkusit znovu
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        title="Watchlisty"
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ['watchlists'] });
          queryClient.invalidateQueries({ queryKey: ['watchlistItems'] });
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
        }}
        isRefreshing={loading || quotesLoading}
      />

      {/* Empty state */}
      {watchlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-6 mb-4">
            <Eye className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            Zatím nemáte žádný watchlist
          </h2>
          <p className="text-muted-foreground">
            Vytvořte watchlist v Nastavení → Watchlisty.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Watchlist toggle buttons + Add button */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {watchlists.map((w) => (
                <Button
                  key={w.id}
                  variant={selectedWatchlistId === w.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedWatchlistId(w.id)}
                  className="h-8"
                >
                  {w.name}
                  <span className="ml-1.5 text-xs opacity-60">
                    {w.item_count || 0}
                  </span>
                </Button>
              ))}
            </div>
            {quotesLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={openAddItem}
              disabled={!selectedWatchlistId}
            >
              <Plus className="h-4 w-4 mr-1" />
              Přidat akcii
            </Button>
          </div>

          {/* Items table */}
          {selectedWatchlist && (
            <>
              {itemsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
                  <Target className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground mb-4">
                    Watchlist je prázdný
                  </p>
                  <Button variant="outline" onClick={openAddItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Přidat akcii
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile: Sort pills + Cards */}
                  <div className="md:hidden">
                    {/* Sort pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2 -mx-1 px-1">
                      {[
                        { key: 'ticker' as SortKey, label: 'A-Z' },
                        { key: 'price' as SortKey, label: 'Cena' },
                        { key: 'change' as SortKey, label: 'Změna' },
                        { key: 'buyTarget' as SortKey, label: 'Nákup' },
                        { key: 'sellTarget' as SortKey, label: 'Prodej' },
                      ].map((option) => {
                        const isActive = sortKey === option.key;
                        return (
                          <button
                            key={option.key}
                            onClick={() => handleSort(option.key)}
                            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                              isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {option.label}
                            {isActive && (
                              <span className="ml-0.5">
                                {sortDir === 'desc' ? '↓' : '↑'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Cards */}
                    <div className="space-y-1.5">
                      {sortedItems.map((item) => (
                        <WatchlistItemCard
                          key={item.id}
                          item={item}
                          quote={quotes[item.stocks.ticker] || null}
                          onEdit={() => openEditItem(item)}
                          onDelete={() => setDeleteItemData(item)}
                          onTags={() => openTagsDialog(item)}
                          onClick={() => onStockClick?.(item.stocks.ticker)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Desktop: Table */}
                  <div className="hidden md:block border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => handleSort('ticker')}
                          >
                            Ticker <SortIcon columnKey="ticker" />
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer select-none"
                            onClick={() => handleSort('price')}
                          >
                            Cena <SortIcon columnKey="price" />
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer select-none"
                            onClick={() => handleSort('change')}
                          >
                            Změna <SortIcon columnKey="change" />
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer select-none"
                            onClick={() => handleSort('buyTarget')}
                          >
                            Nákup <SortIcon columnKey="buyTarget" />
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer select-none"
                            onClick={() => handleSort('sellTarget')}
                          >
                            Prodej <SortIcon columnKey="sellTarget" />
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none hidden md:table-cell"
                            onClick={() => handleSort('sector')}
                          >
                            Sektor <SortIcon columnKey="sector" />
                          </TableHead>
                          <TableHead className="hidden lg:table-cell">
                            Poznámka
                          </TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedItems.map((item) => {
                          const quote = quotes[item.stocks.ticker];
                          const atBuy = isAtBuyTarget(item, quote);
                          const atSell = isAtSellTarget(item, quote);

                          return (
                            <TableRow
                              key={item.id}
                              className={`cursor-pointer hover:bg-muted/50 ${
                                atBuy
                                  ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500'
                                  : atSell
                                    ? 'bg-amber-500/5 border-l-2 border-l-amber-500'
                                    : ''
                              }`}
                              onClick={() => onStockClick?.(item.stocks.ticker)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {/* Signal indicator */}
                                  {(atBuy || atSell) && (
                                    <span
                                      className={`relative flex h-2 w-2 ${atBuy ? 'mr-0.5' : ''}`}
                                    >
                                      <span
                                        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                          atBuy
                                            ? 'bg-emerald-400'
                                            : 'bg-amber-400'
                                        }`}
                                      />
                                      <span
                                        className={`relative inline-flex rounded-full h-2 w-2 ${
                                          atBuy
                                            ? 'bg-emerald-500'
                                            : 'bg-amber-500'
                                        }`}
                                      />
                                    </span>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`font-mono font-semibold ${
                                          atBuy
                                            ? 'text-emerald-500'
                                            : atSell
                                              ? 'text-amber-500'
                                              : ''
                                        }`}
                                      >
                                        {item.stocks.ticker}
                                      </span>
                                      {/* Tags */}
                                      {item.tags && item.tags.length > 0 && (
                                        <div className="flex gap-1 items-center">
                                          {item.tags.map((tag) => (
                                            <span
                                              key={tag.id}
                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none"
                                              style={{
                                                backgroundColor: `${tag.color}15`,
                                                color: tag.color,
                                              }}
                                            >
                                              <span
                                                className="h-1.5 w-1.5 rounded-full"
                                                style={{
                                                  backgroundColor: tag.color,
                                                }}
                                              />
                                              {tag.name}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {item.stocks.name}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {quote
                                  ? formatPrice(
                                      quote.price,
                                      item.stocks.currency,
                                    )
                                  : '—'}
                              </TableCell>
                              <TableCell
                                className={`text-right font-mono ${
                                  quote && quote.changePercent > 0
                                    ? 'text-emerald-500'
                                    : quote && quote.changePercent < 0
                                      ? 'text-rose-500'
                                      : ''
                                }`}
                              >
                                {quote
                                  ? formatPercent(quote.changePercent)
                                  : '—'}
                              </TableCell>
                              <TableCell
                                className={`text-right font-mono ${
                                  atBuy
                                    ? 'text-emerald-500 font-semibold'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {item.target_buy_price
                                  ? formatPrice(
                                      item.target_buy_price,
                                      item.stocks.currency,
                                    )
                                  : '—'}
                              </TableCell>
                              <TableCell
                                className={`text-right font-mono ${
                                  atSell
                                    ? 'text-amber-500 font-semibold'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {item.target_sell_price
                                  ? formatPrice(
                                      item.target_sell_price,
                                      item.stocks.currency,
                                    )
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground hidden md:table-cell">
                                {item.sector || item.stocks.sector || '—'}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell max-w-[150px]">
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
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => openEditItem(item)}
                                    >
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Upravit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => openTagsDialog(item)}
                                    >
                                      <Tag className="h-4 w-4 mr-2" />
                                      Tagy
                                    </DropdownMenuItem>
                                    {watchlists.length > 1 && (
                                      <DropdownMenuItem
                                        onClick={() => setMoveItemData(item)}
                                      >
                                        <MoveRight className="h-4 w-4 mr-2" />
                                        Přesunout
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDeleteItemData(item)}
                                      className="text-destructive"
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
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Add/Edit Item Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? `Upravit ${editingItem.stocks.ticker}`
                : 'Přidat akcii'}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Upravte cíle a poznámky k této akcii.'
                : 'Přidejte novou akcii do watchlistu.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 py-2">
            {!editingItem && (
              <div className="space-y-2">
                <Label htmlFor="ticker">Ticker</Label>
                <Input
                  id="ticker"
                  value={itemTicker}
                  onChange={(e) => setItemTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="font-mono"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="buyTarget">Nákupní cíl</Label>
                <Input
                  id="buyTarget"
                  type="number"
                  step="0.01"
                  value={itemBuyTarget}
                  onChange={(e) => setItemBuyTarget(e.target.value)}
                  placeholder="150.00"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellTarget">Prodejní cíl</Label>
                <Input
                  id="sellTarget"
                  type="number"
                  step="0.01"
                  value={itemSellTarget}
                  onChange={(e) => setItemSellTarget(e.target.value)}
                  placeholder="200.00"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector">Sektor</Label>
              <Input
                id="sector"
                value={itemSector}
                onChange={(e) => setItemSector(e.target.value)}
                placeholder="Technology"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Poznámky</Label>
              <Textarea
                id="notes"
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                placeholder="Proč sleduji tuto akcii..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddItemDialogOpen(false)}
            >
              Zrušit
            </Button>
            <Button
              onClick={handleSaveItem}
              disabled={itemSaving || (!editingItem && !itemTicker.trim())}
            >
              {itemSaving ? 'Ukládám...' : editingItem ? 'Uložit' : 'Přidat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Dialog */}
      <Dialog
        open={!!deleteItemData}
        onOpenChange={(open) => !open && setDeleteItemData(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odebrat {deleteItemData?.stocks.ticker}?</DialogTitle>
            <DialogDescription>
              Opravdu chcete odebrat tuto akcii z watchlistu?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItemData(null)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteItem}
              disabled={itemSaving}
            >
              {itemSaving ? 'Odebírám...' : 'Odebrat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Item Dialog */}
      <Dialog
        open={!!moveItemData}
        onOpenChange={(open) => !open && setMoveItemData(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přesunout {moveItemData?.stocks.ticker}</DialogTitle>
            <DialogDescription>Vyberte cílový watchlist:</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {watchlists
              .filter((w) => w.id !== selectedWatchlistId)
              .map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleMoveItem(w.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-muted transition-colors"
                >
                  <span className="font-medium">{w.name}</span>
                </button>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveItemData(null)}>
              Zrušit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tags Dialog */}
      <Dialog
        open={!!tagsDialogItem}
        onOpenChange={(open) => !open && setTagsDialogItem(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Tagy pro {tagsDialogItem?.stocks.ticker}</DialogTitle>
            <DialogDescription>Vyberte tagy pro tuto akcii.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {allTags.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                Nemáte žádné tagy. Vytvořte je v Nastavení → Watchlist tagy.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-offset-background'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: isSelected
                          ? tag.color
                          : `${tag.color}20`,
                        color: isSelected ? '#fff' : tag.color,
                        borderColor: tag.color,
                        ringColor: tag.color,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagsDialogItem(null)}>
              Zrušit
            </Button>
            <Button
              onClick={handleSaveTags}
              disabled={setItemTagsMutation.isPending}
            >
              {setItemTagsMutation.isPending ? 'Ukládám...' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
