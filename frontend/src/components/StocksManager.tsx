import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { searchStocks } from '@/lib/api';
import type { Stock } from '@/lib/api';
import {
  useStocks,
  useCreateStock,
  useUpdateStock,
  useDeleteStock,
} from '@/hooks/useStocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { MoreHorizontal, Plus, Search, Pencil, Trash2 } from 'lucide-react';

type CompletenessFilter = 'all' | 'complete' | 'incomplete';

// Options from portfolio-tracker
const EXCHANGE_OPTIONS = [
  { value: '', label: 'Bez burzy' },
  { value: 'NYSE', label: 'NYSE (USA)' },
  { value: 'NASDAQ', label: 'Nasdaq (USA)' },
  { value: 'LSE', label: 'London Stock Exchange (UK)' },
  { value: 'XETRA', label: 'Xetra / Deutsche Börse (DE)' },
  { value: 'SIX', label: 'SIX Swiss Exchange (CH)' },
  { value: 'TSX', label: 'Toronto Stock Exchange (CA)' },
  { value: 'ASX', label: 'Australian Securities Exchange (AU)' },
  { value: 'JPX', label: 'Japan Exchange Group (JP)' },
  { value: 'SSE', label: 'Shanghai Stock Exchange (CN)' },
  { value: 'HKEX', label: 'Hong Kong Exchanges (HK)' },
  { value: 'PSE', label: 'Philippine Stock Exchange (PH)' },
  { value: 'OMX-STO', label: 'Nasdaq Stockholm (SE)' },
  { value: 'VIE', label: 'Vienna Stock Exchange (AT)' },
  { value: 'WSE', label: 'Warsaw Stock Exchange (PL)' },
  { value: 'PSE-PRA', label: 'Prague Stock Exchange (CZ)' },
  { value: 'EURONEXT-PARIS', label: 'Euronext Paris (FR)' },
  { value: 'Other', label: 'Jiná' },
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'JPY', label: 'JPY' },
  { value: 'CHF', label: 'CHF' },
  { value: 'CAD', label: 'CAD' },
  { value: 'AUD', label: 'AUD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'CZK', label: 'CZK' },
  { value: 'HKD', label: 'HKD' },
  { value: 'SEK', label: 'SEK' },
  { value: 'DKK', label: 'DKK' },
  { value: 'NOK', label: 'NOK' },
  { value: 'PLN', label: 'PLN' },
  { value: 'HUF', label: 'HUF' },
];

interface StockFormData {
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  currency: string;
  country: string;
  price_scale: number;
  notes: string;
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

interface StocksManagerProps {
  onStockClick?: (ticker: string) => void;
}

export default function StocksManager({ onStockClick }: StocksManagerProps) {
  const queryClient = useQueryClient();

  // React Query hooks
  const {
    data: allStocks = [],
    isLoading: stocksLoading,
    error: stocksError,
  } = useStocks();
  const createStockMutation = useCreateStock();
  const updateStockMutation = useUpdateStock();
  const deleteStockMutation = useDeleteStock();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [completenessFilter, setCompletenessFilter] =
    useState<CompletenessFilter>('all');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form state
  const [formData, setFormData] = useState<StockFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Derived state - apply completeness filter
  const baseStocks = searchResults ?? allStocks;
  const stocks = baseStocks.filter((stock) => {
    if (completenessFilter === 'all') return true;
    const { isComplete } = getStockCompleteness(stock);
    return completenessFilter === 'complete' ? isComplete : !isComplete;
  });
  const loading = stocksLoading || searching;
  const error = stocksError?.message ?? null;
  const saving =
    createStockMutation.isPending ||
    updateStockMutation.isPending ||
    deleteStockMutation.isPending;

  // Search stocks
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      setSearching(true);
      const data = await searchStocks(searchQuery);
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Open create dialog
  const openCreateDialog = () => {
    setSelectedStock(null);
    setIsEditMode(false);
    setFormData(EMPTY_FORM);
    setFormError(null);
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
    setFormData((prev) => ({ ...prev, [name]: value }));
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
        await createStockMutation.mutateAsync(payload as any);
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
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['stocks'] })
          }
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
        title="Akcie"
        onRefresh={() =>
          queryClient.invalidateQueries({ queryKey: ['stocks'] })
        }
        isRefreshing={stocksLoading}
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Přidat akcii
          </Button>
        }
      />

      {/* Search + Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat podle tickeru nebo názvu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs
          value={completenessFilter}
          onValueChange={(value) =>
            setCompletenessFilter(value as CompletenessFilter)
          }
        >
          <TabsList>
            <TabsTrigger value="all">Vše</TabsTrigger>
            <TabsTrigger value="complete">Kompletní</TabsTrigger>
            <TabsTrigger value="incomplete">Nekompletní</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Stocks List */}
      <div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : stocks.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {searchQuery
              ? 'Žádné akcie nenalezeny'
              : 'Zatím nemáte žádné akcie'}
          </p>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                      Ticker
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                      Název
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                      Měna
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                      Burza
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                      Sektor
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                      Země
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stocks.map((stock) => (
                    <TableRow
                      key={stock.id}
                      className={`hover:bg-muted/50 border-border ${onStockClick ? 'cursor-pointer' : ''}`}
                      onClick={() => onStockClick?.(stock.ticker)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const { isComplete, missing } =
                              getStockCompleteness(stock);
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      isComplete
                                        ? 'bg-emerald-500'
                                        : 'bg-amber-500'
                                    }`}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {isComplete
                                    ? 'Kompletní údaje'
                                    : `Chybí: ${missing.join(', ')}`}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                          <span className="font-bold">{stock.ticker}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{stock.name}</TableCell>
                      <TableCell className="text-sm">
                        {stock.currency}
                      </TableCell>
                      <TableCell
                        className={`text-sm ${
                          !stock.exchange ? 'text-muted-foreground' : ''
                        }`}
                      >
                        {stock.exchange || '—'}
                      </TableCell>
                      <TableCell
                        className={`text-sm truncate max-w-[200px] ${!stock.sector ? 'text-muted-foreground' : ''}`}
                      >
                        {stock.sector || '—'}
                      </TableCell>
                      <TableCell
                        className={`text-sm ${!stock.country ? 'text-muted-foreground' : ''}`}
                      >
                        {stock.country || '—'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
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
                              className="text-rose-500"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Smazat
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile List */}
            <div className="md:hidden space-y-1">
              {stocks.map((stock) => (
                <div
                  key={stock.id}
                  className="flex items-center justify-between py-2.5 px-3 bg-muted/30 rounded-lg"
                >
                  {/* Left: Stock info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer overflow-hidden"
                    onClick={() => onStockClick?.(stock.ticker)}
                  >
                    <div className="flex items-center gap-2">
                      {(() => {
                        const { isComplete, missing } =
                          getStockCompleteness(stock);
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  isComplete ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {isComplete
                                ? 'Kompletní údaje'
                                : `Chybí: ${missing.join(', ')}`}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                      <span className="font-mono font-bold text-sm flex-shrink-0">
                        {stock.ticker}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {stock.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/60 truncate">
                      <span className="flex-shrink-0">{stock.currency}</span>
                      {stock.exchange && (
                        <span className="flex-shrink-0">
                          • {stock.exchange}
                        </span>
                      )}
                      {stock.sector && (
                        <span className="truncate text-muted-foreground/40">
                          • {stock.sector}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(stock);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(stock);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
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
                  maxLength={10}
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
                <p className="text-xs text-zinc-500">
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

            <DialogFooter>
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
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat akcii</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat akcii {selectedStock?.ticker}? Tuto akci
              nelze vrátit zpět. Akci nelze smazat pokud má existující
              transakce.
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? 'Mažu...' : 'Smazat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
