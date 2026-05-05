import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import type { Watchlist, WatchlistTag } from '@/lib/api';
import type { SortDir, SortKey } from './WatchlistItemsTable';

interface WatchlistModeRailProps {
  watchlists: Watchlist[];
  selectedWatchlistId: string | null;
  onSelectWatchlist: (watchlistId: string) => void;
}

export function WatchlistModeRail({
  watchlists,
  selectedWatchlistId,
  onSelectWatchlist,
}: WatchlistModeRailProps) {
  return (
    <PillGroup behavior="scroll" bleed>
      {watchlists.map((watchlist) => (
        <PillButton
          key={watchlist.id}
          active={selectedWatchlistId === watchlist.id}
          onClick={() => onSelectWatchlist(watchlist.id)}
          size="md"
          count={watchlist.item_count || 0}
        >
          {watchlist.name}
        </PillButton>
      ))}
    </PillGroup>
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
  const [mobileTagsOpen, setMobileTagsOpen] = useState(false);
  const selectedTagCount = filterTags.length;

  const tagPills = allTags.map((tag) => {
    const isSelected = filterTags.includes(tag.id);
    return (
      <PillButton
        key={tag.id}
        onClick={() => onToggleTag(tag.id)}
        active={isSelected}
        size="sm"
        activeClassName="border-transparent text-white shadow-sm"
        inactiveClassName="border-transparent opacity-60 hover:opacity-90"
        style={{
          backgroundColor: isSelected ? tag.color : `${tag.color}16`,
          color: isSelected ? '#fff' : tag.color,
        }}
      >
        {tag.name}
      </PillButton>
    );
  });

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <PillButton
          onClick={onToggleBuyTarget}
          active={showAtBuyTarget}
          size="sm"
          activeClassName="border-transparent bg-positive/12 text-positive hover:bg-positive/16"
          inactiveClassName="border-transparent bg-positive/6 text-positive/80 hover:bg-positive/10"
        >
          Nákupní cíl
        </PillButton>
        <PillButton
          onClick={onToggleSellTarget}
          active={showAtSellTarget}
          size="sm"
          activeClassName="border-transparent bg-amber-500/12 text-amber-600 hover:bg-amber-500/16"
          inactiveClassName="border-transparent bg-amber-500/6 text-amber-700 hover:bg-amber-500/10"
        >
          Prodejní cíl
        </PillButton>
        <PillButton
          onClick={onToggleOpenMarketsOnly}
          active={showOpenMarketsOnly}
          size="sm"
          activeClassName="border-transparent bg-sky-500/12 text-sky-500 hover:bg-sky-500/16"
          inactiveClassName="border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
        >
          Jen otevřené
        </PillButton>

        {/* Desktop: separator + tags inline */}
        {allTags.length > 0 && (
          <>
            <div aria-hidden="true" className="hidden h-4 w-px bg-border/70 md:block" />
            <div className="hidden flex-wrap gap-2 md:flex">
              {tagPills}
            </div>
          </>
        )}

        {/* Mobile: compact tags toggle */}
        {allTags.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileTagsOpen((v) => !v)}
            className="md:hidden inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            Tagy
            {selectedTagCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
                {selectedTagCount}
              </span>
            )}
          </button>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Vymazat
          </Button>
        )}

        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground">
            {filteredItemsCount} / {totalItemsCount}
          </span>
        )}
      </div>

      {/* Mobile: expanded tags row */}
      {mobileTagsOpen && allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 md:hidden">
          {tagPills}
        </div>
      )}
    </div>
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
