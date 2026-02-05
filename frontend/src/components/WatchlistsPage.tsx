import { useState, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  TrendingUp,
  TrendingDown,
  GripVertical,
  Target,
} from 'lucide-react';
import { type Watchlist, type WatchlistItem, type Quote } from '@/lib/api';
import { formatPrice, formatPercent } from '@/lib/format';
import { useQuotes } from '@/hooks/useQuotes';
import { useQueryClient } from '@tanstack/react-query';
import {
  useWatchlists,
  useWatchlistItems,
  useCreateWatchlist,
  useUpdateWatchlist,
  useDeleteWatchlist,
  useReorderWatchlists,
  useAddWatchlistItem,
  useUpdateWatchlistItem,
  useDeleteWatchlistItem,
  useMoveWatchlistItem,
} from '@/hooks/useWatchlists';

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

// Sortable watchlist item component
interface SortableWatchlistItemProps {
  watchlist: Watchlist;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (w: Watchlist) => void;
  onDelete: (w: Watchlist) => void;
}

function SortableWatchlistItem({
  watchlist,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: SortableWatchlistItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: watchlist.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        onClick={() => onSelect(watchlist.id)}
        className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{watchlist.name}</div>
          <div className="text-xs text-muted-foreground">
            {watchlist.item_count || 0} položek
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(watchlist)}>
              <Pencil className="h-4 w-4 mr-2" />
              Upravit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(watchlist)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Smazat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </button>
    </div>
  );
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

  // Mutations
  const createWatchlistMutation = useCreateWatchlist();
  const updateWatchlistMutation = useUpdateWatchlist();
  const deleteWatchlistMutation = useDeleteWatchlist();
  const reorderWatchlistsMutation = useReorderWatchlists();
  const addItemMutation = useAddWatchlistItem();
  const updateItemMutation = useUpdateWatchlistItem();
  const deleteItemMutation = useDeleteWatchlistItem();
  const moveItemMutation = useMoveWatchlistItem();

  const error = watchlistsError ? (watchlistsError as Error).message : null;

  // Dialogs
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(
    null,
  );
  const [deleteWatchlistData, setDeleteWatchlistData] =
    useState<Watchlist | null>(null);

  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [deleteItemData, setDeleteItemData] = useState<WatchlistItem | null>(
    null,
  );
  const [moveItemData, setMoveItemData] = useState<WatchlistItem | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const [itemTicker, setItemTicker] = useState('');
  const [itemBuyTarget, setItemBuyTarget] = useState('');
  const [itemSellTarget, setItemSellTarget] = useState('');
  const [itemNotes, setItemNotes] = useState('');
  const [itemSector, setItemSector] = useState('');
  const [itemSaving, setItemSaving] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const selectedWatchlist = watchlists.find(
    (w) => w.id === selectedWatchlistId,
  );

  // Drag end handler for watchlist reordering
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = watchlists.findIndex((w) => w.id === active.id);
      const newIndex = watchlists.findIndex((w) => w.id === over.id);
      const newOrder = arrayMove(watchlists, oldIndex, newIndex).map(
        (w) => w.id,
      );
      reorderWatchlistsMutation.mutate(newOrder);
    }
  }

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

  // Watchlist CRUD
  const openCreateWatchlist = () => {
    setEditingWatchlist(null);
    setFormName('');
    setFormDescription('');
    setWatchlistDialogOpen(true);
  };

  const openEditWatchlist = (w: Watchlist) => {
    setEditingWatchlist(w);
    setFormName(w.name);
    setFormDescription(w.description || '');
    setWatchlistDialogOpen(true);
  };

  const handleSaveWatchlist = async () => {
    if (!formName.trim()) return;

    setFormSaving(true);
    try {
      if (editingWatchlist) {
        await updateWatchlistMutation.mutateAsync({
          id: editingWatchlist.id,
          name: formName.trim(),
          description: formDescription.trim() || undefined,
        });
      } else {
        const created = await createWatchlistMutation.mutateAsync({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
        });
        setSelectedWatchlistId(created.id);
      }
      setWatchlistDialogOpen(false);
    } catch (err) {
      console.error('Failed to save watchlist:', err);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteWatchlist = async () => {
    if (!deleteWatchlistData) return;

    setFormSaving(true);
    try {
      await deleteWatchlistMutation.mutateAsync(deleteWatchlistData.id);
      setDeleteWatchlistData(null);
      if (selectedWatchlistId === deleteWatchlistData.id) {
        setSelectedWatchlistId(null);
      }
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
    } finally {
      setFormSaving(false);
    }
  };

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
        actions={
          <Button onClick={openCreateWatchlist} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nový watchlist
          </Button>
        }
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
          <p className="text-muted-foreground mb-4">
            Vytvořte watchlist pro sledování akcií, které vás zajímají.
          </p>
          <Button onClick={openCreateWatchlist}>
            <Plus className="h-4 w-4 mr-1" />
            Vytvořit watchlist
          </Button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar - watchlist list with drag & drop */}
          <div className="md:w-60 flex-shrink-0 space-y-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={watchlists.map((w) => w.id)}
                strategy={verticalListSortingStrategy}
              >
                {watchlists.map((w) => (
                  <SortableWatchlistItem
                    key={w.id}
                    watchlist={w}
                    isSelected={selectedWatchlistId === w.id}
                    onSelect={setSelectedWatchlistId}
                    onEdit={openEditWatchlist}
                    onDelete={setDeleteWatchlistData}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Main content - items table */}
          <div className="flex-1 min-w-0">
            {selectedWatchlist && (
              <>
                {/* Watchlist header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {selectedWatchlist.name}
                    </h2>
                    {selectedWatchlist.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedWatchlist.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {quotesLoading && (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Button size="sm" onClick={openAddItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Přidat akcii
                    </Button>
                  </div>
                </div>

                {/* Items table */}
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
                  <div className="border rounded-lg overflow-hidden">
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
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => onStockClick?.(item.stocks.ticker)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div>
                                    <div className="font-mono font-semibold">
                                      {item.stocks.ticker}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                                      {item.stocks.name}
                                    </div>
                                  </div>
                                  {atBuy && (
                                    <Badge
                                      variant="default"
                                      className="bg-emerald-500 text-xs"
                                    >
                                      <TrendingDown className="h-3 w-3 mr-1" />
                                      Koupit
                                    </Badge>
                                  )}
                                  {atSell && (
                                    <Badge
                                      variant="default"
                                      className="bg-amber-500 text-xs"
                                    >
                                      <TrendingUp className="h-3 w-3 mr-1" />
                                      Prodat
                                    </Badge>
                                  )}
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
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Watchlist Dialog */}
      <Dialog open={watchlistDialogOpen} onOpenChange={setWatchlistDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWatchlist ? 'Upravit watchlist' : 'Nový watchlist'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Název</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Např. Tech akcie"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Popis (volitelný)</Label>
              <Textarea
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Poznámky k watchlistu..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWatchlistDialogOpen(false)}
            >
              Zrušit
            </Button>
            <Button
              onClick={handleSaveWatchlist}
              disabled={formSaving || !formName.trim()}
            >
              {formSaving
                ? 'Ukládám...'
                : editingWatchlist
                  ? 'Uložit'
                  : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Watchlist Dialog */}
      <Dialog
        open={!!deleteWatchlistData}
        onOpenChange={(open) => !open && setDeleteWatchlistData(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat watchlist?</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat watchlist "{deleteWatchlistData?.name}"?
              Tato akce je nevratná a smaže všechny položky v něm.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteWatchlistData(null)}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWatchlist}
              disabled={formSaving}
            >
              {formSaving ? 'Mažu...' : 'Smazat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Item Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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
          <div className="space-y-4">
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
    </div>
  );
}
