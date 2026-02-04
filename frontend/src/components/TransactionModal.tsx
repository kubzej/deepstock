import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  fetchStocks,
  updateTransaction,
  type Stock,
  type Transaction,
} from '@/lib/api';
import { formatPrice, formatDate, formatNumber } from '@/lib/format';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CURRENCY_OPTIONS = [
  'USD',
  'EUR',
  'GBP',
  'CZK',
  'CHF',
  'CAD',
  'AUD',
  'JPY',
  'SEK',
  'DKK',
  'NOK',
  'PLN',
  'HUF',
  'HKD',
  'CNY',
];

type TransactionType = 'BUY' | 'SELL';
type SellMode = 'entire' | 'lot' | 'partial';

interface AvailableLot {
  id: string;
  date: string;
  quantity: number;
  remaining_shares: number;
  price_per_share: number;
  currency: string;
  total_amount: number;
}

interface TransactionFormData {
  stockTicker: string;
  stockName: string;
  type: TransactionType;
  shares: number;
  pricePerShare: number;
  currency: string;
  exchangeRateToCzk: number | null;
  fees: number;
  notes: string;
  date: string;
  sourceTransactionId: string | null;
}

const EMPTY_FORM: TransactionFormData = {
  stockTicker: '',
  stockName: '',
  type: 'BUY',
  shares: 0,
  pricePerShare: 0,
  currency: 'USD',
  exchangeRateToCzk: null,
  fees: 0,
  notes: '',
  date: new Date().toISOString().split('T')[0],
  sourceTransactionId: null,
};

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preselectedTicker?: string;
  /** Transaction to edit - if provided, modal is in edit mode */
  editTransaction?: Transaction | null;
}

export function TransactionModal({
  open,
  onOpenChange,
  onSuccess,
  preselectedTicker,
  editTransaction,
}: TransactionModalProps) {
  const { activePortfolio, refresh } = usePortfolio();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<TransactionFormData>(EMPTY_FORM);

  // SELL-specific state
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([]);
  const [sellMode, setSellMode] = useState<SellMode>('entire');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [lotsLoading, setLotsLoading] = useState(false);

  // Check if we're in edit mode
  const isEditMode = !!editTransaction;

  // Load stocks on open or initialize edit form
  useEffect(() => {
    if (open) {
      loadStocks();
      setError(null);
      setAvailableLots([]);
      setSellMode('entire');
      setSelectedLotId(null);

      if (editTransaction) {
        // Edit mode - populate form from transaction
        setFormData({
          stockTicker: editTransaction.ticker,
          stockName: editTransaction.stockName,
          type: editTransaction.type,
          shares: editTransaction.shares,
          pricePerShare: editTransaction.price,
          currency: editTransaction.currency,
          exchangeRateToCzk: editTransaction.exchangeRate || null,
          fees: editTransaction.fees || 0,
          notes: editTransaction.notes || '',
          date: editTransaction.date.split('T')[0],
          sourceTransactionId: editTransaction.sourceTransactionId || null,
        });
      } else if (preselectedTicker) {
        setFormData(() => ({
          ...EMPTY_FORM,
          stockTicker: preselectedTicker,
        }));
      } else {
        setFormData(EMPTY_FORM);
      }
    }
  }, [open, preselectedTicker, editTransaction]);

  // Update currency when stock changes
  useEffect(() => {
    const stock = stocks.find((s) => s.ticker === formData.stockTicker);
    if (stock?.currency) {
      setFormData((prev) => ({
        ...prev,
        stockName: stock.name,
        currency: stock.currency,
      }));
    }
  }, [formData.stockTicker, stocks]);

  // Load available lots when switching to SELL mode or changing stock
  useEffect(() => {
    if (formData.type === 'SELL' && formData.stockTicker && activePortfolio) {
      loadAvailableLots();
    }
  }, [formData.type, formData.stockTicker, activePortfolio?.id]);

  const loadStocks = async () => {
    try {
      const data = await fetchStocks(500, 0);
      setStocks(data);
    } catch (err) {
      console.error('Failed to load stocks:', err);
    }
  };

  const loadAvailableLots = async () => {
    if (!formData.stockTicker || !activePortfolio) return;

    setLotsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/portfolio/${activePortfolio.id}/available-lots/${formData.stockTicker}`,
      );
      if (response.ok) {
        const lots = await response.json();
        setAvailableLots(lots);
      }
    } catch (err) {
      console.error('Failed to load available lots:', err);
    } finally {
      setLotsLoading(false);
    }
  };

  const stockOptions = useMemo(
    () =>
      stocks.map((s) => ({
        value: s.ticker,
        label: `${s.ticker} - ${s.name}`,
      })),
    [stocks],
  );

  // Calculate totals
  const totalAmount = formData.shares * formData.pricePerShare;
  const totalWithFees = totalAmount + formData.fees;
  const totalInCzk = formData.exchangeRateToCzk
    ? totalWithFees * formData.exchangeRateToCzk
    : null;

  // SELL helpers
  const selectedLot = availableLots.find((l) => l.id === selectedLotId);
  const totalAvailableShares = availableLots.reduce(
    (sum, lot) => sum + lot.remaining_shares,
    0,
  );
  const maxSellQuantity =
    sellMode === 'entire'
      ? totalAvailableShares
      : selectedLot?.remaining_shares || 0;

  const handleTypeChange = (type: TransactionType) => {
    setFormData((prev) => ({
      ...prev,
      type,
      sourceTransactionId: null,
      shares: 0,
    }));
    if (type === 'BUY') {
      setSellMode('entire');
      setSelectedLotId(null);
    }
  };

  const handleSellModeChange = (mode: SellMode) => {
    setSellMode(mode);

    if (mode === 'entire') {
      setFormData((prev) => ({
        ...prev,
        shares: totalAvailableShares,
        sourceTransactionId: null,
      }));
      setSelectedLotId(null);
    } else if (mode === 'lot' && availableLots.length > 0) {
      const firstLot = availableLots[0];
      setSelectedLotId(firstLot.id);
      setFormData((prev) => ({
        ...prev,
        shares: firstLot.remaining_shares,
        sourceTransactionId: firstLot.id,
      }));
    } else if (mode === 'partial' && availableLots.length > 0) {
      const firstLot = availableLots[0];
      setSelectedLotId(firstLot.id);
      setFormData((prev) => ({
        ...prev,
        shares: 0,
        sourceTransactionId: firstLot.id,
      }));
    }
  };

  const handleLotSelect = (lotId: string) => {
    const lot = availableLots.find((l) => l.id === lotId);
    if (!lot) return;

    setSelectedLotId(lotId);
    setFormData((prev) => ({
      ...prev,
      sourceTransactionId: lotId,
      shares: sellMode === 'lot' ? lot.remaining_shares : prev.shares,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Edit mode doesn't need portfolio (it's already set on the transaction)
    if (!isEditMode && !activePortfolio) {
      setError('Vyberte portfolio');
      return;
    }

    if (!formData.stockTicker) {
      setError('Vyberte akcii');
      return;
    }

    if (formData.shares <= 0) {
      setError('Zadejte počet akcií');
      return;
    }

    if (formData.pricePerShare <= 0) {
      setError('Zadejte cenu za akcii');
      return;
    }

    // Skip max quantity check in edit mode
    if (
      !isEditMode &&
      formData.type === 'SELL' &&
      formData.shares > maxSellQuantity
    ) {
      setError(
        `Nemůžete prodat více akcií než máte k dispozici (${formatNumber(maxSellQuantity)})`,
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // EDIT MODE
      if (isEditMode && editTransaction) {
        await updateTransaction(
          editTransaction.portfolioId,
          editTransaction.id,
          {
            shares: formData.shares,
            price_per_share: formData.pricePerShare,
            currency: formData.currency,
            exchange_rate_to_czk: formData.exchangeRateToCzk || undefined,
            fees: formData.fees,
            notes: formData.notes || undefined,
            executed_at: new Date(formData.date).toISOString(),
          },
        );
      }
      // CREATE MODE - For "entire position" SELL, create separate transactions for each lot (FIFO)
      else if (
        formData.type === 'SELL' &&
        sellMode === 'entire' &&
        availableLots.length > 0
      ) {
        const sortedLots = [...availableLots].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

        let remainingToSell = formData.shares;
        let isFirstTransaction = true;

        for (const lot of sortedLots) {
          if (remainingToSell <= 0) break;

          const quantityFromThisLot = Math.min(
            remainingToSell,
            lot.remaining_shares,
          );
          remainingToSell -= quantityFromThisLot;

          await submitTransaction({
            ...formData,
            shares: quantityFromThisLot,
            sourceTransactionId: lot.id,
            fees: isFirstTransaction ? formData.fees : 0,
          });
          isFirstTransaction = false;
        }
      } else {
        await submitTransaction(formData);
      }

      // Refresh holdings
      await refresh();

      // Reset form
      setFormData(EMPTY_FORM);
      setSellMode('entire');
      setSelectedLotId(null);
      setAvailableLots([]);

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nepodařilo se přidat transakci',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNumberChange =
    (field: keyof TransactionFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const handleExchangeRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? null : parseFloat(e.target.value);
    setFormData((prev) => ({ ...prev, exchangeRateToCzk: value }));
  };

  const submitTransaction = async (data: TransactionFormData) => {
    const response = await fetch(
      `${API_URL}/api/portfolio/${activePortfolio!.id}/transactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_ticker: data.stockTicker,
          stock_name: data.stockName || data.stockTicker,
          type: data.type,
          shares: data.shares,
          price_per_share: data.pricePerShare,
          currency: data.currency,
          exchange_rate_to_czk: data.exchangeRateToCzk || null,
          fees: data.fees,
          notes: data.notes || null,
          executed_at: new Date(data.date).toISOString(),
          source_transaction_id: data.sourceTransactionId,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Nepodařilo se přidat transakci');
    }

    return response.json();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? `Upravit ${editTransaction?.type === 'BUY' ? 'nákup' : 'prodej'} ${editTransaction?.ticker}`
              : 'Přidat transakci'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-rose-500 bg-rose-500/10 rounded-lg">
              {error}
            </div>
          )}

          {/* Transaction Type Toggle - disabled in edit mode */}
          {isEditMode ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-700/60 text-zinc-300">
                {formData.type === 'BUY' ? 'BUY' : 'SELL'}
              </span>
              <span>{formData.stockTicker}</span>
              <span className="text-muted-foreground/60">·</span>
              <span>{formData.stockName}</span>
            </div>
          ) : (
            <ToggleGroup
              type="single"
              value={formData.type}
              onValueChange={(v) => v && handleTypeChange(v as TransactionType)}
              className="w-full"
            >
              <ToggleGroupItem
                value="BUY"
                className="flex-1 data-[state=on]:bg-emerald-600 data-[state=on]:text-white"
              >
                NÁKUP
              </ToggleGroupItem>
              <ToggleGroupItem
                value="SELL"
                className="flex-1 data-[state=on]:bg-rose-600 data-[state=on]:text-white"
              >
                PRODEJ
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {/* Portfolio info - only in create mode */}
          {!isEditMode && activePortfolio && (
            <div className="text-sm text-muted-foreground">
              Portfolio:{' '}
              <span className="text-foreground font-medium">
                {activePortfolio.name}
              </span>
            </div>
          )}

          {/* Stock Select - only in create mode */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label>Akcie *</Label>
              <Select
                value={formData.stockTicker}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, stockTicker: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte akcii..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {stockOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* SELL Mode Selection */}
          {formData.type === 'SELL' && formData.stockTicker && (
            <div className="space-y-3">
              {lotsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Načítám dostupné pozice...
                </p>
              ) : availableLots.length === 0 ? (
                <div className="p-3 text-sm text-rose-500 bg-rose-500/10 rounded-lg">
                  Nemáte žádné akcie k prodeji v tomto portfoliu.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Způsob prodeje</Label>
                    <ToggleGroup
                      type="single"
                      value={sellMode}
                      onValueChange={(v) =>
                        v && handleSellModeChange(v as SellMode)
                      }
                      className="justify-start"
                    >
                      <ToggleGroupItem value="entire" className="text-xs">
                        Celá pozice ({formatNumber(totalAvailableShares)})
                      </ToggleGroupItem>
                      <ToggleGroupItem value="lot" className="text-xs">
                        Celý lot
                      </ToggleGroupItem>
                      <ToggleGroupItem value="partial" className="text-xs">
                        Část lotu
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  {(sellMode === 'lot' || sellMode === 'partial') && (
                    <div className="space-y-2">
                      <Label>Vyberte lot</Label>
                      <div className="grid gap-2 max-h-[200px] overflow-y-auto">
                        {availableLots.map((lot) => (
                          <button
                            key={lot.id}
                            type="button"
                            className={`p-3 text-left border rounded-lg transition-colors ${
                              selectedLotId === lot.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => handleLotSelect(lot.id)}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">
                                {formatDate(lot.date)}
                              </span>
                              <span className="text-sm font-mono">
                                {formatNumber(lot.remaining_shares)} ks
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-xs text-muted-foreground">
                              <span>Nákupní cena</span>
                              <span className="font-mono">
                                {formatPrice(lot.price_per_share, lot.currency)}
                              </span>
                            </div>
                            {lot.quantity !== lot.remaining_shares && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Původně: {formatNumber(lot.quantity)} ks
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {sellMode === 'partial' && selectedLot && (
                    <p className="text-xs text-muted-foreground">
                      Max. {formatNumber(selectedLot.remaining_shares)} ks z
                      tohoto lotu
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Date and Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Datum *</Label>
              <Input
                type="date"
                id="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, date: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shares">
                Počet akcií *
                {formData.type === 'SELL' && maxSellQuantity > 0 && (
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    (max {formatNumber(maxSellQuantity)})
                  </span>
                )}
              </Label>
              <Input
                type="number"
                id="shares"
                value={formData.shares || ''}
                onChange={handleNumberChange('shares')}
                onBlur={() => {
                  if (
                    formData.type === 'SELL' &&
                    maxSellQuantity > 0 &&
                    formData.shares > maxSellQuantity
                  ) {
                    setFormData((prev) => ({
                      ...prev,
                      shares: maxSellQuantity,
                    }));
                  }
                }}
                placeholder="0"
                step="0.000001"
                min="0"
                max={
                  formData.type === 'SELL' && maxSellQuantity > 0
                    ? maxSellQuantity
                    : undefined
                }
                required
                disabled={
                  formData.type === 'SELL' &&
                  (sellMode === 'entire' || sellMode === 'lot')
                }
              />
            </div>
          </div>

          {/* Price and Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Cena za akcii *</Label>
              <Input
                type="number"
                id="price"
                value={formData.pricePerShare || ''}
                onChange={handleNumberChange('pricePerShare')}
                placeholder="0.00"
                step="0.0001"
                min="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Měna</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, currency: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((curr) => (
                    <SelectItem key={curr} value={curr}>
                      {curr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Exchange Rate and Fees */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exchangeRate">Kurz k CZK *</Label>
              <Input
                type="number"
                id="exchangeRate"
                value={formData.exchangeRateToCzk || ''}
                onChange={handleExchangeRateChange}
                placeholder="např. 23.50"
                step="0.0001"
                min="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fees">Poplatky ({formData.currency})</Label>
              <Input
                type="number"
                id="fees"
                value={formData.fees || ''}
                onChange={handleNumberChange('fees')}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Total Display */}
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Celková částka</span>
              <span className="font-mono font-medium">
                {formatPrice(totalAmount, formData.currency)}
                {formData.fees > 0 &&
                  ` + ${formatPrice(formData.fees, formData.currency)} poplatky`}
              </span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span>Celkem</span>
              <span className="font-mono">
                {formatPrice(totalWithFees, formData.currency)}
              </span>
            </div>
            {totalInCzk !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Celkem v CZK</span>
                <span className="font-mono">
                  {formatPrice(totalInCzk, 'CZK')}
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Poznámky</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Volitelné poznámky k transakci..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Zrušit
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                (!isEditMode &&
                  formData.type === 'SELL' &&
                  availableLots.length === 0)
              }
            >
              {loading
                ? isEditMode
                  ? 'Ukládám...'
                  : 'Přidávám...'
                : isEditMode
                  ? 'Uložit změny'
                  : `Přidat ${formData.type === 'BUY' ? 'nákup' : 'prodej'}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
