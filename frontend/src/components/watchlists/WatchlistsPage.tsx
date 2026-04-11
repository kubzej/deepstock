import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  EmptyState,
  ErrorState,
  FilteredEmptyState,
  PageIntro,
  PageShell,
} from '@/components/shared';
import { Eye, Target } from 'lucide-react';
import {
  type WatchlistItem,
  type WatchlistItemWithSource,
} from '@/lib/api';
import { useQuotes } from '@/hooks/useQuotes';
import { useQueryClient } from '@tanstack/react-query';
import {
  useWatchlists,
  useWatchlistItems,
  useAllWatchlistItems,
  useAddWatchlistItem,
  useUpdateWatchlistItem,
  useDeleteWatchlistItem,
  useMoveWatchlistItem,
} from '@/hooks/useWatchlists';
import { useWatchlistTags, useSetItemTags } from '@/hooks/useWatchlistTags';
import { useHoldings } from '@/hooks/useHoldings';
import { WatchlistItemCard } from './WatchlistItemCard';
import {
  WatchlistItemsTable,
  type SortKey,
  type SortDir,
} from './WatchlistItemsTable';
import {
  FilteredMonitoringPanel,
  WatchlistModeRail,
  WatchlistsMobileSortRow,
} from './WatchlistPageSections';
import {
  WatchlistItemFormDialog,
  type WatchlistItemFormData,
} from './WatchlistItemFormDialog';
import { isAtBuyTarget, isAtSellTarget } from './watchlistSignals';

// Special ID for filter view
const FILTER_VIEW_ID = '__filter__';

export function WatchlistsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // React Query hooks
  const {
    data: watchlists = [],
    isLoading: watchlistsLoading,
    isFetching: watchlistsFetching,
    dataUpdatedAt: watchlistsUpdatedAt,
    error: watchlistsError,
  } = useWatchlists();
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(
    null,
  );
  const [lastConcreteWatchlistId, setLastConcreteWatchlistId] = useState<string | null>(
    null,
  );

  // Filter view state
  const isFilterView = selectedWatchlistId === FILTER_VIEW_ID;
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showAtBuyTarget, setShowAtBuyTarget] = useState(false);
  const [showAtSellTarget, setShowAtSellTarget] = useState(false);

  // Auto-select first watchlist
  useEffect(() => {
    if (watchlists.length > 0 && !selectedWatchlistId) {
      setSelectedWatchlistId(watchlists[0].id);
    }
  }, [watchlists, selectedWatchlistId]);

  useEffect(() => {
    if (selectedWatchlistId && selectedWatchlistId !== FILTER_VIEW_ID) {
      setLastConcreteWatchlistId(selectedWatchlistId);
    }
  }, [selectedWatchlistId]);

  // Single watchlist items
  const {
    data: singleWatchlistItems = [],
    isLoading: itemsLoading,
    isFetching: itemsFetching,
  } = useWatchlistItems(isFilterView ? null : selectedWatchlistId);

  // All watchlist items (for filter view)
  const {
    data: allItems = [],
    isLoading: allItemsLoading,
    isFetching: allItemsFetching,
  } = useAllWatchlistItems();

  // Determine which items to display
  const items = useMemo(() => {
    if (!isFilterView) return singleWatchlistItems;
    return allItems as WatchlistItem[];
  }, [isFilterView, singleWatchlistItems, allItems]);

  // Get tickers from items for quotes
  const tickers = useMemo(
    () => items.map((item) => item.stocks.ticker),
    [items],
  );
  const {
    data: quotes = {},
    isFetching: quotesFetching,
    dataUpdatedAt: quotesUpdatedAt,
  } = useQuotes(tickers);

  // Combined fetching state for refresh indicator
  const isFetching =
    watchlistsFetching || itemsFetching || allItemsFetching || quotesFetching;

  // Oldest data update time (for freshness indicator)
  const dataUpdatedAt = useMemo(() => {
    const timestamps = [watchlistsUpdatedAt, quotesUpdatedAt].filter(
      (t): t is number => t !== undefined && t > 0,
    );
    if (timestamps.length === 0) return null;
    return Math.min(...timestamps);
  }, [watchlistsUpdatedAt, quotesUpdatedAt]);

  // All holdings (for AI suggestions — to detect avg_cost)
  const { data: allHoldings = [] } = useHoldings(null);

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

  const handleSelectWatchlist = (watchlistId: string) => {
    setSelectedWatchlistId(watchlistId);
  };

  const handleToggleFilteredMode = () => {
    if (isFilterView) {
      setSelectedWatchlistId(
        lastConcreteWatchlistId ?? watchlists[0]?.id ?? null,
      );
      return;
    }

    setSelectedWatchlistId(FILTER_VIEW_ID);
  };

  const clearFilters = () => {
    setFilterTags([]);
    setShowAtBuyTarget(false);
    setShowAtSellTarget(false);
  };

  // Sorting
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // Text fields and earnings default to asc (A-Z, soonest first)
      setSortDir(
        key === 'ticker' || key === 'sector' || key === 'earnings'
          ? 'asc'
          : 'desc',
      );
    }
  };

  // Filtering + Sorting
  const filteredAndSortedItems = useMemo(() => {
    // First filter (only in filter view)
    let filtered = [...items];

    if (isFilterView) {
      // Filter by tags
      if (filterTags.length > 0) {
        filtered = filtered.filter((item) =>
          item.tags?.some((tag) => filterTags.includes(tag.id)),
        );
      }

      // Filter by target status
      if (showAtBuyTarget || showAtSellTarget) {
        filtered = filtered.filter((item) => {
          const quote = quotes[item.stocks.ticker];
          const atBuy = isAtBuyTarget(item, quote);
          const atSell = isAtSellTarget(item, quote);

          if (showAtBuyTarget && showAtSellTarget) {
            return atBuy || atSell;
          }
          if (showAtBuyTarget) return atBuy;
          if (showAtSellTarget) return atSell;
          return true;
        });
      }
    }

    // Then sort
    return filtered.sort((a, b) => {
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
        case 'earnings': {
          const aDate = quotes[a.stocks.ticker]?.earningsDate;
          const bDate = quotes[b.stocks.ticker]?.earningsDate;
          // Items without earnings date always go to the bottom
          const aHas = aDate ? 1 : 0;
          const bHas = bDate ? 1 : 0;
          if (aHas !== bHas) {
            return bHas - aHas; // Items with dates first
          }
          if (!aDate || !bDate) return 0; // Both have no date
          const aTime = new Date(aDate).getTime();
          const bTime = new Date(bDate).getTime();
          return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
        }
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
  }, [
    items,
    quotes,
    sortKey,
    sortDir,
    isFilterView,
    filterTags,
    showAtBuyTarget,
    showAtSellTarget,
  ]);

  // Check if any filters are active
  const hasActiveFilters =
    filterTags.length > 0 || showAtBuyTarget || showAtSellTarget;

  const filterSummary = useMemo(() => {
    const parts: string[] = [];

    if (showAtBuyTarget) parts.push('nákupní signál');
    if (showAtSellTarget) parts.push('prodejní signál');

    if (filterTags.length > 0) {
      const activeTags = allTags
        .filter((tag) => filterTags.includes(tag.id))
        .map((tag) => tag.name);

      if (activeTags.length > 0) {
        parts.push(`tagy: ${activeTags.join(', ')}`);
      }
    }

    return parts.length > 0 ? `Aktivní filtry: ${parts.join(' • ')}` : null;
  }, [allTags, filterTags, showAtBuyTarget, showAtSellTarget]);

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
          targetBuyPrice: formData.buyTarget
            ? parseFloat(formData.buyTarget)
            : null,
          targetSellPrice: formData.sellTarget
            ? parseFloat(formData.sellTarget)
            : null,
          notes: formData.notes.trim() || null,
          sector: formData.sector.trim() || null,
        });
      } else {
        if (!formData.ticker.trim()) return;
        await addItemMutation.mutateAsync({
          watchlistId: selectedWatchlistId,
          ticker: formData.ticker.trim().toUpperCase(),
          targetBuyPrice: formData.buyTarget
            ? parseFloat(formData.buyTarget)
            : undefined,
          targetSellPrice: formData.sellTarget
            ? parseFloat(formData.sellTarget)
            : undefined,
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

  // Loading state - only show skeleton on initial load (no data yet)
  if (watchlistsLoading) {
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
      <PageShell width="full">
        <ErrorState
          title="Nepodařilo se načíst watchlisty"
          description={error}
          retryAction={{ label: 'Zkusit znovu', onClick: () => window.location.reload() }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      {/* Header */}
      <PageIntro
        title="Watchlisty"
        onRefresh={() => {
          // Invalidate all caches - React Query will refetch them
          queryClient.invalidateQueries({ queryKey: ['watchlists'] });
          queryClient.invalidateQueries({ queryKey: ['watchlistItems'] });
          queryClient.invalidateQueries({ queryKey: ['allWatchlistItems'] });
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
          // Remove individual quote caches to force fresh batch fetch
          queryClient.removeQueries({ queryKey: ['quote'] });
        }}
        isRefreshing={isFetching}
        dataUpdatedAt={dataUpdatedAt}
      />

      {/* Empty state */}
      {watchlists.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="Zatím nemáte žádný watchlist"
          description="Vytvořte watchlist v Nastavení → Watchlisty."
          action={{
            label: 'Otevřít nastavení',
            onClick: () => navigate({ to: '/settings/watchlists' }),
          }}
        />
      ) : (
        <div className="space-y-4">
          <WatchlistModeRail
            watchlists={watchlists}
            selectedWatchlistId={selectedWatchlistId}
            isFilterView={isFilterView}
            totalItemsCount={allItems.length}
            filteredItemsCount={filteredAndSortedItems.length}
            hasActiveFilters={hasActiveFilters}
            filterSummary={filterSummary}
            onSelectWatchlist={handleSelectWatchlist}
            onSelectFilteredMode={handleToggleFilteredMode}
          />

          {/* Filter panel (only in filter view) */}
          {isFilterView && (
            <FilteredMonitoringPanel
              allTags={allTags}
              filterTags={filterTags}
              showAtBuyTarget={showAtBuyTarget}
              showAtSellTarget={showAtSellTarget}
              filteredItemsCount={filteredAndSortedItems.length}
              totalItemsCount={allItems.length}
              hasActiveFilters={hasActiveFilters}
              onToggleBuyTarget={() => setShowAtBuyTarget((prev) => !prev)}
              onToggleSellTarget={() => setShowAtSellTarget((prev) => !prev)}
              onToggleTag={(tagId) =>
                setFilterTags((prev) =>
                  prev.includes(tagId)
                    ? prev.filter((id) => id !== tagId)
                    : [...prev, tagId],
                )
              }
              onClearFilters={clearFilters}
            />
          )}

          {/* Items table */}
          {(selectedWatchlist || isFilterView) && (
            <>
              {(isFilterView ? allItemsLoading : itemsLoading) ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredAndSortedItems.length === 0 ? (
                isFilterView ? (
                  hasActiveFilters ? (
                    <FilteredEmptyState
                      description="Zkus upravit tagy nebo cílové filtry a zobraz další kandidáty."
                      clearAction={{
                        label: 'Vymazat filtry',
                        onClick: clearFilters,
                      }}
                    />
                  ) : (
                    <EmptyState
                      icon={Target}
                      title="Žádné položky ve watchlistech"
                      description="Jakmile přidáš akcie do některého watchlistu, uvidíš je i ve filtrovaném přehledu."
                    />
                  )
                ) : (
                  <EmptyState
                    icon={Target}
                    title="Watchlist je prázdný"
                    description="Přidej první akcii a začni sledovat nákupní a prodejní příležitosti."
                    action={{ label: 'Přidat akcii', onClick: openAddItem }}
                  />
                )
              ) : (
                <>
                  {/* Mobile: Sort pills + Cards */}
                  <div className="md:hidden">
                    <WatchlistsMobileSortRow
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />

                    {/* Cards */}
                    <div className="space-y-1.5">
                      {filteredAndSortedItems.map((item) => (
                        <WatchlistItemCard
                          key={item.id}
                          item={item}
                          quote={quotes[item.stocks.ticker] || null}
                          onEdit={() => openEditItem(item)}
                          onDelete={() => setDeleteItemData(item)}
                          onTags={() => openTagsDialog(item)}
                          onMove={() => setMoveItemData(item)}
                          showMoveOption={
                            watchlists.length > 1 && !isFilterView
                          }
                          onClick={() => navigate({ to: '/stocks/$ticker', params: { ticker: item.stocks.ticker } })}
                          showWatchlistName={isFilterView}
                          watchlistName={
                            isFilterView
                              ? (item as WatchlistItemWithSource).watchlist_name
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {/* Desktop: Table */}
                  <WatchlistItemsTable
                    items={filteredAndSortedItems}
                    quotes={quotes}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    onEdit={openEditItem}
                    onDelete={setDeleteItemData}
                    onMove={setMoveItemData}
                    onTagsEdit={openTagsDialog}
                    showMoveOption={watchlists.length > 1 && !isFilterView}
                    showWatchlistName={isFilterView}
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
        holding={
          editingItem
            ? (allHoldings.find((h) => h.ticker === editingItem.stocks.ticker) ?? null)
            : null
        }
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
    </PageShell>
  );
}
