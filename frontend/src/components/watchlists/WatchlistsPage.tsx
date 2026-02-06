import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/PageHeader';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Plus, Eye, Target } from 'lucide-react';
import { type WatchlistItem } from '@/lib/api';
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
import { WatchlistItemCard } from './WatchlistItemCard';
import {
  WatchlistItemsTable,
  type SortKey,
  type SortDir,
} from './WatchlistItemsTable';
import {
  WatchlistItemFormDialog,
  type WatchlistItemFormData,
} from './WatchlistItemFormDialog';

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
    setAddItemDialogOpen(true);
  };

  const openEditItem = (item: WatchlistItem) => {
    setEditingItem(item);
    setAddItemDialogOpen(true);
  };

  const handleSaveItem = async (formData: WatchlistItemFormData) => {
    if (!selectedWatchlistId) return;

    setItemSaving(true);
    try {
      if (editingItem) {
        await updateItemMutation.mutateAsync({
          itemId: editingItem.id,
          watchlistId: selectedWatchlistId,
          targetBuyPrice: formData.buyTarget ? parseFloat(formData.buyTarget) : null,
          targetSellPrice: formData.sellTarget ? parseFloat(formData.sellTarget) : null,
          notes: formData.notes.trim() || null,
          sector: formData.sector.trim() || null,
        });
      } else {
        if (!formData.ticker.trim()) return;
        await addItemMutation.mutateAsync({
          watchlistId: selectedWatchlistId,
          ticker: formData.ticker.trim().toUpperCase(),
          targetBuyPrice: formData.buyTarget ? parseFloat(formData.buyTarget) : undefined,
          targetSellPrice: formData.sellTarget ? parseFloat(formData.sellTarget) : undefined,
          notes: formData.notes.trim() || undefined,
          sector: formData.sector.trim() || undefined,
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
      <div className="space-y-4 p-4">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => window.location.reload()} variant="outline">
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
                    <PillGroup className="pb-3 mb-2">
                      {[
                        { key: 'ticker' as SortKey, label: 'A-Z' },
                        { key: 'price' as SortKey, label: 'Cena' },
                        { key: 'change' as SortKey, label: 'Změna' },
                        { key: 'buyTarget' as SortKey, label: 'Nákup' },
                        { key: 'sellTarget' as SortKey, label: 'Prodej' },
                      ].map((option) => (
                        <PillButton
                          key={option.key}
                          active={sortKey === option.key}
                          onClick={() => handleSort(option.key)}
                          size="sm"
                        >
                          {option.label}
                          {sortKey === option.key && (
                            <span className="ml-0.5">
                              {sortDir === 'desc' ? '↓' : '↑'}
                            </span>
                          )}
                        </PillButton>
                      ))}
                    </PillGroup>

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
                  <WatchlistItemsTable
                    items={sortedItems}
                    quotes={quotes}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    onStockClick={onStockClick}
                    onEdit={openEditItem}
                    onDelete={setDeleteItemData}
                    onMove={setMoveItemData}
                    onTagsEdit={openTagsDialog}
                    showMoveOption={watchlists.length > 1}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Add/Edit Item Dialog */}
      <WatchlistItemFormDialog
        open={addItemDialogOpen}
        onOpenChange={setAddItemDialogOpen}
        editingItem={editingItem}
        onSave={handleSaveItem}
        saving={itemSaving}
      />

      {/* Delete Item Dialog */}
      <ConfirmDialog
        open={!!deleteItemData}
        onOpenChange={(open) => !open && setDeleteItemData(null)}
        title={`Odebrat ${deleteItemData?.stocks.ticker}?`}
        description="Opravdu chcete odebrat tuto akcii z watchlistu?"
        confirmLabel="Odebrat"
        onConfirm={handleDeleteItem}
        loading={itemSaving}
        variant="destructive"
      />

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
