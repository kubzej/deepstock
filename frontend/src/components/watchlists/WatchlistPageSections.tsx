import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import type { Watchlist, WatchlistTag } from '@/lib/api';
import type { SortDir, SortKey } from './WatchlistItemsTable';

interface WatchlistModeRailProps {
  watchlists: Watchlist[];
  selectedWatchlistId: string | null;
  isFilterView: boolean;
  totalItemsCount: number;
  filteredItemsCount: number;
  hasActiveFilters: boolean;
  filterSummary: string | null;
  onSelectWatchlist: (watchlistId: string) => void;
  onSelectFilteredMode: () => void;
}

export function WatchlistModeRail({
  watchlists,
  selectedWatchlistId,
  isFilterView,
  totalItemsCount,
  filteredItemsCount,
  hasActiveFilters,
  filterSummary,
  onSelectWatchlist,
  onSelectFilteredMode,
}: WatchlistModeRailProps) {
  return (
    <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
      <PillGroup behavior="scroll" bleed className="xl:max-w-4xl">
        {watchlists.map((watchlist) => (
          <PillButton
            key={watchlist.id}
            active={!isFilterView && selectedWatchlistId === watchlist.id}
            onClick={() => onSelectWatchlist(watchlist.id)}
            size="md"
            count={watchlist.item_count || 0}
          >
            {watchlist.name}
          </PillButton>
        ))}
      </PillGroup>

      <div className="flex items-center gap-2 self-start xl:self-auto">
        <PillButton
          active={isFilterView}
          onClick={onSelectFilteredMode}
          size="md"
          count={isFilterView ? filteredItemsCount : totalItemsCount}
          indicatorClassName={hasActiveFilters ? 'bg-amber-500' : undefined}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtrované
        </PillButton>
        {!isFilterView && hasActiveFilters && filterSummary ? (
          <div className="text-xs text-muted-foreground">{filterSummary}</div>
        ) : null}
      </div>
    </div>
  );
}

interface FilteredMonitoringPanelProps {
  allTags: WatchlistTag[];
  filterTags: string[];
  showAtBuyTarget: boolean;
  showAtSellTarget: boolean;
  showOpenMarketsOnly: boolean;
  filteredItemsCount: number;
  totalItemsCount: number;
  hasActiveFilters: boolean;
  onToggleBuyTarget: () => void;
  onToggleSellTarget: () => void;
  onToggleOpenMarketsOnly: () => void;
  onToggleTag: (tagId: string) => void;
  onClearFilters: () => void;
}

export function FilteredMonitoringPanel({
  allTags,
  filterTags,
  showAtBuyTarget,
  showAtSellTarget,
  showOpenMarketsOnly,
  filteredItemsCount,
  totalItemsCount,
  hasActiveFilters,
  onToggleBuyTarget,
  onToggleSellTarget,
  onToggleOpenMarketsOnly,
  onToggleTag,
  onClearFilters,
}: FilteredMonitoringPanelProps) {
  return (
    <section className="space-y-3 overflow-hidden rounded-2xl border border-border/70 bg-background/85 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Filtry
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-9 shrink-0 text-sm"
          >
            <X className="mr-1 h-3 w-3" />
            Vymazat filtry
          </Button>
        )}
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Signál
          </div>
          <PillGroup>
            <PillButton
              onClick={onToggleBuyTarget}
              active={showAtBuyTarget}
              size="md"
              indicatorClassName="bg-positive"
              activeClassName="border-transparent bg-positive/12 text-positive hover:bg-positive/16"
              inactiveClassName="border-transparent bg-positive/6 text-positive/80 hover:bg-positive/10"
            >
              Nákupní cíl
            </PillButton>
            <PillButton
              onClick={onToggleSellTarget}
              active={showAtSellTarget}
              size="md"
              indicatorClassName="bg-amber-500"
              activeClassName="border-transparent bg-amber-500/12 text-amber-600 hover:bg-amber-500/16"
              inactiveClassName="border-transparent bg-amber-500/6 text-amber-700 hover:bg-amber-500/10"
            >
              Prodejní cíl
            </PillButton>
            <PillButton
              onClick={onToggleOpenMarketsOnly}
              active={showOpenMarketsOnly}
              size="md"
              activeClassName="border-transparent bg-sky-500/12 text-sky-500 hover:bg-sky-500/16"
              inactiveClassName="border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
            >
              Jen otevřené
            </PillButton>
          </PillGroup>
        </div>

        {allTags.length > 0 && (
          <div className="min-w-0 space-y-1.5 overflow-hidden">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Tagy
            </div>
            <PillGroup behavior="scroll" className="w-full max-w-full">
              {allTags.map((tag) => {
                const isSelected = filterTags.includes(tag.id);

                return (
                  <PillButton
                    key={tag.id}
                    onClick={() => onToggleTag(tag.id)}
                    active={isSelected}
                    size="md"
                    indicatorPosition="leading"
                    indicatorClassName="bg-current"
                    activeClassName="border-transparent text-white shadow-sm"
                    inactiveClassName="border-transparent opacity-75 hover:opacity-100"
                    style={{
                      backgroundColor: isSelected ? tag.color : `${tag.color}16`,
                      color: isSelected ? '#fff' : tag.color,
                    }}
                  >
                    {tag.name}
                  </PillButton>
                );
              })}
            </PillGroup>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {filteredItemsCount} / {totalItemsCount}
      </div>
    </section>
  );
}

interface WatchlistsMobileSortRowProps {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

export function WatchlistsMobileSortRow({
  sortKey,
  sortDir,
  onSort,
}: WatchlistsMobileSortRowProps) {
  return (
    <PillGroup behavior="scroll" bleed className="pb-3 mb-2">
      {[
        { key: 'ticker' as SortKey, label: 'A-Z' },
        { key: 'price' as SortKey, label: 'Cena' },
        { key: 'change' as SortKey, label: 'Změna' },
        { key: 'earnings' as SortKey, label: 'Earnings' },
        { key: 'buyTarget' as SortKey, label: 'Nákup' },
        { key: 'sellTarget' as SortKey, label: 'Prodej' },
      ].map((option) => (
        <PillButton
          key={option.key}
          active={sortKey === option.key}
          onClick={() => onSort(option.key)}
          size="md"
          direction={sortKey === option.key ? sortDir : undefined}
        >
          {option.label}
        </PillButton>
      ))}
    </PillGroup>
  );
}
