import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { generateStockMetadata } from '@/lib/api';
import type { Stock } from '@/lib/api';
import { withStockDetailBack } from '@/lib/stockDetailNavigation';
import {
  useStocks,
  useCreateStock,
  useUpdateStock,
  useDeleteStock,
} from '@/hooks/useStocks';
import { useHoldings } from '@/hooks/useHoldings';
import { useAllWatchlistItems } from '@/hooks/useWatchlists';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  EmptyState,
  ErrorState,
  FilteredEmptyState,
  PageIntro,
  PageTopRail,
  PageShell,
} from '@/components/shared';
import {
  MoreHorizontal,
  Plus,
  Search,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { EXCHANGE_OPTIONS, CURRENCY_OPTIONS } from '@/lib/constants';
import {
  applyStockMetadataSuggestion,
  type StockMetadataFormFields,
} from '@/lib/stockMetadata';

type CompletenessFilter = 'complete' | 'incomplete';
type StockStatusFilter = 'held' | 'watchlist' | 'untracked';
type FacetKey = 'sectors' | 'exchanges' | 'currencies' | 'countries';

interface StockFacetFilters {
  sectors: string[];
  exchanges: string[];
  currencies: string[];
  countries: string[];
}

interface FacetOption {
  value: string;
  label: string;
  count: number;
}

interface StockFormData extends StockMetadataFormFields {
  ticker: string;
}

const EMPTY_FORM: StockFormData = {
  ticker: '',
  name: '',
  sector: '',
  exchange: '',
  currency: 'USD',
  country: '',
  price_scale: 1,
  notes: '',
};

const EMPTY_FACET_FILTERS: StockFacetFilters = {
  sectors: [],
  exchanges: [],
  currencies: [],
  countries: [],
};

function normalizeSearchText(value?: string | null): string {
  return (value ?? '').trim().toLocaleLowerCase('cs-CZ');
}

function getFacetValue(value?: string | null): string {
  return (value ?? '').trim();
}

function toggleSelectedValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value].sort((a, b) => a.localeCompare(b));
}

function countSelectedFacets(filters: StockFacetFilters): number {
  return Object.values(filters).reduce((sum, values) => sum + values.length, 0);
}

function buildFacetOptions(
  stocks: Stock[],
  getValue: (stock: Stock) => string | undefined | null,
): FacetOption[] {
  const counts = new Map<string, number>();

  for (const stock of stocks) {
    const value = getFacetValue(getValue(stock));
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, label: value, count }));
}

function matchesSelectedFacet(value: string | undefined | null, selected: string[]) {
  if (selected.length === 0) return true;
  return selected.includes(getFacetValue(value));
}

// Check if stock has all important fields filled
function getStockCompleteness(stock: Stock): {
  isComplete: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!stock.sector) missing.push('Sektor');
  if (!stock.exchange) missing.push('Burza');
  return {
    isComplete: missing.length === 0,
    missing,
  };
}

interface CheckboxFilterGroupProps {
  title: string;
  options: FacetOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}

function CheckboxFilterGroup({
  title,
  options,
  selectedValues,
  onToggle,
}: CheckboxFilterGroupProps) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selectedValues.includes(option.value);
          return (
            <label
              key={option.value}
              className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/60"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(option.value)}
              />
              <span>{option.label}</span>
              <span className="font-mono-price text-[10px] text-muted-foreground">
                {option.count}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function StocksManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // React Query hooks
  const {
    data: allStocks = [],
    isLoading: stocksLoading,
    isFetching: stocksFetching,
    dataUpdatedAt,
    error: stocksError,
  } = useStocks();
  const { data: allHoldings = [], isLoading: holdingsLoading } =
    useHoldings(null);
  const { data: allWatchlistItems = [], isLoading: watchlistItemsLoading } =
    useAllWatchlistItems();
  const createStockMutation = useCreateStock();
  const updateStockMutation = useUpdateStock();
  const deleteStockMutation = useDeleteStock();

  const [searchQuery, setSearchQuery] = useState('');
  const [completenessFilters, setCompletenessFilters] = useState<
    CompletenessFilter[]
  >([]);
  const [statusFilters, setStatusFilters] = useState<StockStatusFilter[]>([]);
  const [facetFilters, setFacetFilters] =
    useState<StockFacetFilters>(EMPTY_FACET_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form state
  const [formData, setFormData] = useState<StockFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInfo, setAiInfo] = useState<string | null>(null);

  const holdingTickers = useMemo(
    () =>
      new Set(
        allHoldings
          .filter((holding) => Number(holding.shares) > 0)
          .map((holding) => holding.ticker.toUpperCase()),
      ),
    [allHoldings],
  );
  const watchlistTickers = useMemo(
    () =>
      new Set(
        allWatchlistItems.map((item) => item.stocks.ticker.toUpperCase()),
      ),
    [allWatchlistItems],
  );
  const facetOptions = useMemo(
    () => ({
      sectors: buildFacetOptions(allStocks, (stock) => stock.sector),
      exchanges: buildFacetOptions(allStocks, (stock) => stock.exchange),
      currencies: buildFacetOptions(allStocks, (stock) => stock.currency),
      countries: buildFacetOptions(allStocks, (stock) => stock.country),
    }),
    [allStocks],
  );
  const stockStats = useMemo(() => {
    let incomplete = 0;
    let untracked = 0;

    for (const stock of allStocks) {
      if (!getStockCompleteness(stock).isComplete) incomplete += 1;
      const ticker = stock.ticker.toUpperCase();
      if (!holdingTickers.has(ticker) && !watchlistTickers.has(ticker)) {
        untracked += 1;
      }
    }

    return {
      incomplete,
      held: holdingTickers.size,
      watchlist: watchlistTickers.size,
      untracked,
    };
  }, [allStocks, holdingTickers, watchlistTickers]);
  const activeFilterCount =
    countSelectedFacets(facetFilters) +
    completenessFilters.length +
    statusFilters.length +
    (searchQuery.trim() ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const stocks = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery);

    return allStocks.filter((stock) => {
      if (normalizedQuery) {
        const haystack = normalizeSearchText(
          [stock.ticker, stock.name, stock.notes].filter(Boolean).join(' '),
        );
        if (!haystack.includes(normalizedQuery)) return false;
      }

      if (completenessFilters.length > 0) {
        const { isComplete } = getStockCompleteness(stock);
        const completenessValue = isComplete ? 'complete' : 'incomplete';
        if (!completenessFilters.includes(completenessValue)) return false;
      }

      const ticker = stock.ticker.toUpperCase();
      const isHeld = holdingTickers.has(ticker);
      const isWatchlisted = watchlistTickers.has(ticker);
      if (statusFilters.length > 0) {
        const matchesStatus =
          (statusFilters.includes('held') && isHeld) ||
          (statusFilters.includes('watchlist') && isWatchlisted) ||
          (statusFilters.includes('untracked') && !isHeld && !isWatchlisted);
        if (!matchesStatus) return false;
      }

      return (
        matchesSelectedFacet(stock.sector, facetFilters.sectors) &&
        matchesSelectedFacet(stock.exchange, facetFilters.exchanges) &&
        matchesSelectedFacet(stock.currency, facetFilters.currencies) &&
        matchesSelectedFacet(stock.country, facetFilters.countries)
      );
    });
  }, [
    allStocks,
    completenessFilters,
    facetFilters,
    holdingTickers,
    searchQuery,
    statusFilters,
    watchlistTickers,
  ]);
  const statusDataLoading =
    statusFilters.length > 0 && (holdingsLoading || watchlistItemsLoading);
  const loading = stocksLoading || statusDataLoading;
  const error = stocksError?.message ?? null;
  const saving =
    createStockMutation.isPending ||
    updateStockMutation.isPending ||
    deleteStockMutation.isPending;

  // Open create dialog
  const openCreateDialog = () => {
    setSelectedStock(null);
    setIsEditMode(false);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setAiError(null);
    setAiInfo(null);
    setDialogOpen(true);
  };

  // Open edit dialog
  const openEditDialog = (stock: Stock) => {
    setSelectedStock(stock);
    setIsEditMode(true);
    setFormData({
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector || '',
      exchange: stock.exchange || '',
      currency: stock.currency || 'USD',
      country: stock.country || '',
      price_scale: stock.price_scale ?? 1,
      notes: stock.notes || '',
    });
    setFormError(null);
    setAiError(null);
    setAiInfo(null);
    setDialogOpen(true);
  };

  // Open delete dialog
  const openDeleteDialog = (stock: Stock) => {
    setSelectedStock(stock);
    setFormError(null);
    setDeleteDialogOpen(true);
  };

  // Handle text input change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'country' ? value.toUpperCase().slice(0, 2) : value,
    }));
  };

  // Handle number input change
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value === '' ? 1 : parseFloat(value),
    }));
  };

  // Handle select change
  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value === '_none_' ? '' : value,
    }));
  };

  const toggleFacetFilter = (key: FacetKey, value: string) => {
    setFacetFilters((prev) => ({
      ...prev,
      [key]: toggleSelectedValue(prev[key], value),
    }));
  };

  const toggleCompletenessFilter = (value: string) => {
    setCompletenessFilters((prev) =>
      toggleSelectedValue(prev, value as CompletenessFilter),
    );
  };

  const toggleStatusFilter = (value: string) => {
    setStatusFilters((prev) =>
      toggleSelectedValue(prev, value as StockStatusFilter),
    );
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setCompletenessFilters([]);
    setStatusFilters([]);
    setFacetFilters(EMPTY_FACET_FILTERS);
  };

  const handleAiAutofill = async () => {
    const resolvedTicker = formData.ticker.trim().toUpperCase();
    if (!resolvedTicker) return;

    setAiLoading(true);
    setAiError(null);
    setAiInfo(null);

    try {
      const suggestion = await generateStockMetadata(resolvedTicker);
      setFormData((prev) => {
        const { nextData, appliedFields } = applyStockMetadataSuggestion(
          prev,
          suggestion,
        );
        setAiInfo(
          appliedFields.length > 0
            ? `Doplněno: ${appliedFields.join(', ')}${suggestion.used_ai ? ' přes AI.' : '.'}`
            : 'Všechna podporovaná pole už jsou vyplněná.',
        );
        return nextData;
      });
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Nepodařilo se AI doplnění.',
      );
    } finally {
      setAiLoading(false);
    }
  };

  // Submit form (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.ticker.trim() || !formData.name.trim()) {
      setFormError('Ticker a název jsou povinné');
      return;
    }

    try {
      setFormError(null);

      const payload = {
        ticker: formData.ticker.toUpperCase(),
        name: formData.name,
        sector: formData.sector || undefined,
        exchange: formData.exchange || undefined,
        currency: formData.currency,
        country: formData.country || undefined,
        price_scale: formData.price_scale,
        notes: formData.notes || undefined,
      };

      if (isEditMode && selectedStock) {
        await updateStockMutation.mutateAsync({
          id: selectedStock.id,
          data: payload,
        });
      } else {
        await createStockMutation.mutateAsync(payload);
      }

      setDialogOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : `Nepodařilo se ${isEditMode ? 'upravit' : 'vytvořit'} akcii`,
      );
    }
  };

  // Delete stock
  const handleDelete = async () => {
    if (!selectedStock) return;
    try {
      setFormError(null);
      await deleteStockMutation.mutateAsync(selectedStock.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Nepodařilo se smazat akcii',
      );
    }
  };

  const dialogTitle = isEditMode ? 'Upravit akcii' : 'Přidat novou akcii';
  const submitLabel = isEditMode
    ? saving
      ? 'Ukládám...'
      : 'Uložit změny'
    : saving
      ? 'Přidávám...'
      : 'Přidat akcii';

  if (error && !loading) {
    return (
      <PageShell width="full">
        <ErrorState
          title="Nepodařilo se načíst akcie"
          description={error}
          retryAction={{
            label: 'Zkusit znovu',
            onClick: () => queryClient.invalidateQueries({ queryKey: ['stocks'] }),
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      {/* Header */}
      <PageIntro
        title="Akcie"
        onRefresh={() =>
          queryClient.invalidateQueries({ queryKey: ['stocks'] })
        }
        isRefreshing={stocksFetching}
        dataUpdatedAt={dataUpdatedAt}
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Přidat akcii
          </Button>
        }
      />

      {/* Search + Filters */}
      <PageTopRail className={filtersExpanded ? 'relative top-auto z-auto' : undefined}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Hledat ticker, název nebo poznámku..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => setFiltersExpanded((value) => !value)}
            aria-expanded={filtersExpanded}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filtry
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {stocks.length} / {allStocks.length}
          </span>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-3 w-3" />
              Vymazat
            </Button>
          )}
        </div>

        {filtersExpanded && (
          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Filtry</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                disabled={!hasActiveFilters}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="mr-1 h-3 w-3" />
                Reset
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <CheckboxFilterGroup
                title="Kompletnost"
                options={[
                  { value: 'complete', label: 'Kompletní', count: allStocks.length - stockStats.incomplete },
                  { value: 'incomplete', label: 'Nekompletní', count: stockStats.incomplete },
                ]}
                selectedValues={completenessFilters}
                onToggle={toggleCompletenessFilter}
              />

              <CheckboxFilterGroup
                title="Stav"
                options={[
                  { value: 'held', label: 'Pozice', count: stockStats.held },
                  { value: 'watchlist', label: 'Watchlist', count: stockStats.watchlist },
                  { value: 'untracked', label: 'Mimo', count: stockStats.untracked },
                ]}
                selectedValues={statusFilters}
                onToggle={toggleStatusFilter}
              />

              <CheckboxFilterGroup
                title="Sektor"
                options={facetOptions.sectors}
                selectedValues={facetFilters.sectors}
                onToggle={(value) => toggleFacetFilter('sectors', value)}
              />
              <CheckboxFilterGroup
                title="Burza"
                options={facetOptions.exchanges}
                selectedValues={facetFilters.exchanges}
                onToggle={(value) => toggleFacetFilter('exchanges', value)}
              />
              <CheckboxFilterGroup
                title="Měna"
                options={facetOptions.currencies}
                selectedValues={facetFilters.currencies}
                onToggle={(value) => toggleFacetFilter('currencies', value)}
              />
              <CheckboxFilterGroup
                title="Země"
                options={facetOptions.countries}
                selectedValues={facetFilters.countries}
                onToggle={(value) => toggleFacetFilter('countries', value)}
              />
            </div>
          </div>
        )}
      </PageTopRail>

      {/* Stocks List */}
      <div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : stocks.length === 0 ? (
          hasActiveFilters ? (
            <FilteredEmptyState
              description="Zkus jiný ticker, uprav poznámku nebo zjemni filtry."
              clearAction={{
                label: 'Vymazat filtry',
                onClick: clearAllFilters,
              }}
            />
          ) : (
            <EmptyState
              icon={Plus}
              title="Zatím nemáte žádné akcie"
              description="Přidej první akcii a začni budovat vlastní stock databázi."
              action={{ label: 'Přidat akcii', onClick: openCreateDialog }}
            />
          )
        ) : (
          <div className="space-y-0.5">
            {stocks.map((stock) => {
              const { isComplete, missing } = getStockCompleteness(stock);
              return (
                <div
                  key={stock.id}
                  className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 group cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: '/stocks/$ticker',
                      params: { ticker: stock.ticker },
                      state: withStockDetailBack({
                        to: '/stocks',
                        label: 'Akcie',
                      }),
                    })
                  }
                >
                  {/* Stock info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`font-bold text-sm ${isComplete ? '' : 'text-warning'}`}>
                            {stock.ticker}
                          </span>
                        </TooltipTrigger>
                        {!isComplete && (
                          <TooltipContent side="top">
                            Chybí: {missing.join(', ')}
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <span className="text-xs text-muted-foreground truncate">
                        {stock.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 truncate">
                      <span><span className="opacity-50">Měna:</span> {stock.currency}</span>
                      {stock.exchange && <span><span className="opacity-50">Burza:</span> {stock.exchange}</span>}
                      {stock.country && <span><span className="opacity-50">Země:</span> {stock.country}</span>}
                      {stock.sector && <span className="truncate"><span className="opacity-50">Sektor:</span> {stock.sector}</span>}
                    </div>
                  </div>

                  {/* Actions - desktop only */}
                  <div className="hidden md:flex">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(stock);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Upravit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(stock);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Smazat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {/* Row 1: Ticker + Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ticker">Ticker *</Label>
                <Input
                  id="ticker"
                  name="ticker"
                  placeholder="AAPL"
                  value={formData.ticker}
                  onChange={handleChange}
                  disabled={isEditMode}
                  required
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Název společnosti *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Apple Inc."
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Row 2: Sector + Exchange */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sector">Sektor</Label>
                <Input
                  id="sector"
                  name="sector"
                  placeholder="Technology"
                  value={formData.sector}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label>Burza</Label>
                <Select
                  value={formData.exchange || '_none_'}
                  onValueChange={(v) => handleSelectChange('exchange', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte burzu..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCHANGE_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value || '_none_'}
                        value={opt.value || '_none_'}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Currency + Country */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Měna</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => handleSelectChange('currency', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Země</Label>
                <Input
                  id="country"
                  name="country"
                  placeholder="US"
                  value={formData.country}
                  onChange={handleChange}
                  maxLength={2}
                />
              </div>
            </div>

            {/* Row 4: Price Scale */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price_scale">Cenový poměr</Label>
                <Input
                  id="price_scale"
                  name="price_scale"
                  type="number"
                  step="any"
                  min="0.0001"
                  max="1"
                  value={formData.price_scale}
                  onChange={handleNumberChange}
                />
                <p className="text-xs text-muted-foreground">
                  Poměr pro převod kotované ceny na cenu za akcii. 1 = normální,
                  0.01 = cena za 100 ks (LSE)
                </p>
              </div>
            </div>

            {/* Row 5: Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Poznámky</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Jakékoli poznámky k této akcii..."
                value={formData.notes}
                onChange={handleChange}
                rows={3}
              />
            </div>

            {aiError && <p className="text-xs text-destructive">{aiError}</p>}
            {aiInfo && !aiError && (
              <p className="text-xs text-muted-foreground">{aiInfo}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleAiAutofill}
                disabled={aiLoading || !formData.ticker.trim()}
                className="gap-1.5"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiLoading ? 'Doplňuji...' : 'AI doplnit'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Zrušit
              </Button>
              <Button type="submit" disabled={saving}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Smazat akcii"
        description={`Opravdu chcete smazat akcii ${selectedStock?.ticker}? Tuto akci nelze vrátit zpět. Akci nelze smazat pokud má existující transakce.`}
        confirmLabel="Smazat"
        onConfirm={handleDelete}
        loading={saving}
        variant="destructive"
      />
    </PageShell>
  );
}
