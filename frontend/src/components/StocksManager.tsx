import { useState, useEffect } from 'react';
import {
  fetchStocks,
  searchStocks,
  createStock,
  updateStock,
  deleteStock,
} from '@/lib/api';
import type { Stock } from '@/lib/api';
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
import { MoreHorizontal, Plus, Search, Pencil, Trash2 } from 'lucide-react';

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

interface StocksManagerProps {
  onStockClick?: (ticker: string) => void;
}

export default function StocksManager({ onStockClick }: StocksManagerProps) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form state
  const [formData, setFormData] = useState<StockFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load stocks
  const loadStocks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStocks();
      setStocks(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nepodařilo se načíst akcie',
      );
    } finally {
      setLoading(false);
    }
  };

  // Search stocks
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadStocks();
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await searchStocks(searchQuery);
      setStocks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba při vyhledávání');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStocks();
  }, []);

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
      setSaving(true);
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
        await updateStock(selectedStock.id, payload);
      } else {
        await createStock(payload);
      }

      setDialogOpen(false);
      loadStocks();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : `Nepodařilo se ${isEditMode ? 'upravit' : 'vytvořit'} akcii`,
      );
    } finally {
      setSaving(false);
    }
  };

  // Delete stock
  const handleDelete = async () => {
    if (!selectedStock) return;
    try {
      setSaving(true);
      setFormError(null);
      await deleteStock(selectedStock.id);
      setDeleteDialogOpen(false);
      loadStocks();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Nepodařilo se smazat akcii',
      );
    } finally {
      setSaving(false);
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
        <Button onClick={loadStocks} className="mt-4">
          Zkusit znovu
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Akcie</h1>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Přidat akcii
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Hledat podle tickeru nebo názvu..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stocks Table */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Seznam akcií ({stocks.length})
        </h2>

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Název</TableHead>
                <TableHead>Měna</TableHead>
                <TableHead>Burza</TableHead>
                <TableHead>Sektor</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.map((stock) => (
                <TableRow
                  key={stock.id}
                  className={onStockClick ? 'cursor-pointer' : ''}
                  onClick={() => onStockClick?.(stock.ticker)}
                >
                  <TableCell className="font-mono font-medium">
                    {stock.ticker}
                  </TableCell>
                  <TableCell>{stock.name}</TableCell>
                  <TableCell>{stock.currency}</TableCell>
                  <TableCell
                    className={!stock.exchange ? 'text-muted-foreground' : ''}
                  >
                    {stock.exchange || '—'}
                  </TableCell>
                  <TableCell
                    className={!stock.sector ? 'text-muted-foreground' : ''}
                  >
                    {stock.sector || '—'}
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
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
