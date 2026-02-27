/**
 * Option Transaction Modal
 *
 * Modal for option transaction operations:
 * - mode='open': Create new position (BTO/STO)
 * - mode='close': Close existing position (BTC/STC/EXPIRATION/ASSIGNMENT/EXERCISE)
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Info } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  useCreateOptionTransaction,
  useCloseOptionPosition,
} from '@/lib/optionsHooks';
import { formatPrice, formatDate } from '@/lib/format';
import { API_URL } from '@/lib/api';
import type { OptionType, OptionAction, OptionHolding } from '@/lib/api';

// ============ Types ============

export type ModalMode = 'open' | 'close';

interface AvailableLot {
  id: string;
  date: string;
  quantity: number;
  remaining_shares: number;
  price_per_share: number;
  currency: string;
  total_amount: number;
}

interface OptionTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Modal mode - defaults to 'open' */
  mode?: ModalMode;
  /** For edit/close mode: the holding */
  holding?: OptionHolding | null;
}

// ============ Constants ============

const OPEN_ACTIONS: { value: OptionAction; label: string }[] = [
  { value: 'BTO', label: 'Buy to Open' },
  { value: 'STO', label: 'Sell to Open' },
];

const LONG_CLOSE_ACTIONS: { value: OptionAction; label: string }[] = [
  { value: 'STC', label: 'Sell to Close' },
  { value: 'EXPIRATION', label: 'Expirace' },
  { value: 'EXERCISE', label: 'Exercise' },
];

const SHORT_CLOSE_ACTIONS: { value: OptionAction; label: string }[] = [
  { value: 'BTC', label: 'Buy to Close' },
  { value: 'EXPIRATION', label: 'Expirace' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
];

// ============ Helpers ============

function getModalTitle(mode: ModalMode): string {
  switch (mode) {
    case 'open':
      return 'Nová opční transakce';
    case 'close':
      return 'Zavřít pozici';
  }
}

function getSubmitLabel(mode: ModalMode, isPending: boolean): string {
  if (isPending) return 'Ukládám...';
  switch (mode) {
    case 'open':
      return 'Přidat transakci';
    case 'close':
      return 'Zavřít pozici';
  }
}

function generateOccSymbol(
  ticker: string,
  expirationDate: string,
  strikePrice: string,
  optionType: OptionType,
): string {
  if (!ticker || !expirationDate || !strikePrice) return '';

  const date = new Date(expirationDate);
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const typeChar = optionType === 'call' ? 'C' : 'P';
  const strike = Math.round(parseFloat(strikePrice) * 1000)
    .toString()
    .padStart(8, '0');

  return `${ticker.toUpperCase()}${yy}${mm}${dd}${typeChar}${strike}`;
}

// ============ Component ============

export function OptionTransactionModal({
  open,
  onOpenChange,
  onSuccess,
  mode = 'open',
  holding,
}: OptionTransactionModalProps) {
  const { portfolio } = usePortfolio();
  const createMutation = useCreateOptionTransaction();
  const closeMutation = useCloseOptionPosition();

  const isCloseMode = mode === 'close' && !!holding;
  const isOpenMode = mode === 'open';

  // Form state
  const [ticker, setTicker] = useState('');
  const [optionType, setOptionType] = useState<OptionType>('call');
  const [action, setAction] = useState<OptionAction>('BTO');
  const [strikePrice, setStrikePrice] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [contracts, setContracts] = useState('1');
  const [premium, setPremium] = useState('');
  const [fees, setFees] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [notes, setNotes] = useState('');

  // Lot selection state (for ASSIGNMENT short call / EXERCISE long put)
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [lotsLoading, setLotsLoading] = useState(false);

  // Determine if this action requires selling shares (needs lot selection)
  const requiresLotSelection = useMemo(() => {
    if (!isCloseMode || !holding) return false;
    // Short CALL + ASSIGNMENT = must sell shares
    // Long PUT + EXERCISE = must sell shares
    return (
      (action === 'ASSIGNMENT' && holding.option_type === 'call') ||
      (action === 'EXERCISE' && holding.option_type === 'put')
    );
  }, [isCloseMode, holding, action]);

  // Determine if this action creates a stock transaction
  const createsStockTransaction = useMemo(() => {
    return action === 'ASSIGNMENT' || action === 'EXERCISE';
  }, [action]);

  // Get stock transaction description
  const stockTransactionInfo = useMemo(() => {
    if (!isCloseMode || !holding || !createsStockTransaction) return null;

    const shares = parseInt(contracts, 10) * 100;
    const strike = holding.strike_price;
    const avgPremium = holding.avg_premium || 0;
    const symbol = holding.symbol;

    // Determine if BUY or SELL
    let txType: 'NÁKUP' | 'PRODEJ';
    if (action === 'ASSIGNMENT') {
      txType = holding.option_type === 'put' ? 'NÁKUP' : 'PRODEJ';
    } else {
      // EXERCISE
      txType = holding.option_type === 'call' ? 'NÁKUP' : 'PRODEJ';
    }

    // Calculate effective price
    // For SHORT positions (ASSIGNMENT): premium affects price
    // For LONG positions (EXERCISE): premium is sunk cost, use strike
    let effectivePrice = strike;
    if (action === 'ASSIGNMENT' && holding.position === 'short') {
      if (txType === 'NÁKUP') {
        // Short PUT assigned: effective buy price = strike - premium
        effectivePrice = strike - avgPremium;
      } else {
        // Short CALL assigned: effective sell price = strike + premium
        effectivePrice = strike + avgPremium;
      }
    }

    return {
      type: txType,
      shares,
      symbol,
      strike,
      effectivePrice,
      avgPremium,
      isAdjusted:
        action === 'ASSIGNMENT' &&
        holding.position === 'short' &&
        avgPremium > 0,
    };
  }, [isCloseMode, holding, createsStockTransaction, action, contracts]);

  // Available actions based on mode
  const availableActions = useMemo(() => {
    if (isCloseMode && holding) {
      return holding.position === 'long'
        ? LONG_CLOSE_ACTIONS
        : SHORT_CLOSE_ACTIONS;
    }
    return OPEN_ACTIONS;
  }, [isCloseMode, holding]);

  // Load available lots when needed
  useEffect(() => {
    if (requiresLotSelection && holding && portfolio?.id) {
      loadAvailableLots();
    } else {
      setAvailableLots([]);
      setSelectedLotId(null);
    }
  }, [requiresLotSelection, holding?.symbol, portfolio?.id]);

  const loadAvailableLots = async () => {
    if (!holding?.symbol || !portfolio?.id) return;

    setLotsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/portfolio/${portfolio.id}/available-lots/${holding.symbol}`,
      );
      if (response.ok) {
        const lots = await response.json();
        setAvailableLots(lots);
        // Auto-select first lot if available
        if (lots.length > 0) {
          setSelectedLotId(lots[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load available lots:', err);
    } finally {
      setLotsLoading(false);
    }
  };

  // Initialize form based on mode
  const initializeForm = useCallback(() => {
    if (isCloseMode && holding) {
      setTicker(holding.symbol);
      setOptionType(holding.option_type);
      setAction(holding.position === 'long' ? 'STC' : 'BTC');
      setStrikePrice(holding.strike_price.toString());
      setExpirationDate(holding.expiration_date);
      setContracts(holding.contracts.toString());
      setPremium('');
      setFees('');
      setExchangeRate('');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSelectedLotId(null);
    } else {
      setTicker('');
      setOptionType('call');
      setAction('BTO');
      setStrikePrice('');
      setExpirationDate('');
      setContracts('1');
      setPremium('');
      setFees('');
      setExchangeRate('');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSelectedLotId(null);
    }
  }, [isCloseMode, holding]);

  useEffect(() => {
    if (open) {
      initializeForm();
    }
  }, [open, initializeForm]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const occSymbol = useMemo(
    () => generateOccSymbol(ticker, expirationDate, strikePrice, optionType),
    [ticker, expirationDate, strikePrice, optionType],
  );

  // Check what fields are required based on action
  const isPremiumRequired =
    action !== 'EXPIRATION' && action !== 'ASSIGNMENT' && action !== 'EXERCISE';
  const isExchangeRateRequired = action !== 'EXPIRATION';

  // Validation
  const isValid = useMemo(() => {
    // Basic fields always required
    if (!transactionDate) return false;

    if (isOpenMode) {
      // Open mode needs all fields
      if (
        !ticker ||
        !strikePrice ||
        !expirationDate ||
        !contracts ||
        !exchangeRate ||
        !premium
      ) {
        return false;
      }
    }

    if (isCloseMode && holding) {
      // Close mode validation based on action
      if (parseInt(contracts, 10) > holding.contracts) return false;

      if (action === 'EXPIRATION') {
        // Expiration only needs date
        return true;
      }

      if (action === 'ASSIGNMENT' || action === 'EXERCISE') {
        // Need exchange rate
        if (!exchangeRate) return false;
        // If selling shares, need lot selection
        if (requiresLotSelection && !selectedLotId) return false;
        return true;
      }

      // STC/BTC need premium and exchange rate
      if (!premium || !exchangeRate) return false;
    }

    return true;
  }, [
    ticker,
    strikePrice,
    expirationDate,
    contracts,
    transactionDate,
    exchangeRate,
    premium,
    isOpenMode,
    isCloseMode,
    holding,
    action,
    requiresLotSelection,
    selectedLotId,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!portfolio?.id || !isValid) return;

    try {
      if (isCloseMode && holding) {
        await closeMutation.mutateAsync({
          portfolioId: portfolio.id,
          optionSymbol: holding.option_symbol,
          closingAction: action,
          contracts: parseInt(contracts, 10),
          closeDate: transactionDate,
          premium: premium ? parseFloat(premium) : undefined,
          fees: fees ? parseFloat(fees) : undefined,
          exchangeRateToCzk: exchangeRate
            ? parseFloat(exchangeRate)
            : undefined,
          notes: notes || undefined,
          sourceTransactionId: selectedLotId || undefined,
        });
      } else {
        await createMutation.mutateAsync({
          portfolioId: portfolio.id,
          data: {
            symbol: ticker.toUpperCase(),
            option_type: optionType,
            action,
            strike_price: parseFloat(strikePrice),
            expiration_date: expirationDate,
            contracts: parseInt(contracts, 10),
            premium: parseFloat(premium),
            fees: fees ? parseFloat(fees) : undefined,
            exchange_rate_to_czk: parseFloat(exchangeRate),
            date: transactionDate,
            notes: notes || undefined,
          },
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Option transaction failed:', err);
    }
  };

  const isPending = createMutation.isPending || closeMutation.isPending;
  const error = createMutation.error || closeMutation.error;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{getModalTitle(mode)}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {/* Close mode info */}
          {isCloseMode && holding && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm">
                Zavíráte pozici:{' '}
                <span className="font-mono-price font-medium">
                  {holding.symbol} {holding.option_type.toUpperCase()} $
                  {holding.strike_price}
                </span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Otevřeno: {holding.contracts} kontraktů @ $
                {holding.avg_premium?.toFixed(2) || '—'}
              </p>
            </div>
          )}

          {/* Ticker - disabled in close mode only */}
          {isOpenMode && (
            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker podkladu</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                autoComplete="off"
              />
            </div>
          )}

          {/* Option Type & Action */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isOpenMode && (
              <div className="space-y-2">
                <Label>Typ opce</Label>
                <ToggleGroup
                  type="single"
                  value={optionType}
                  onValueChange={(v) => v && setOptionType(v as OptionType)}
                  className="w-full"
                >
                  <ToggleGroupItem value="call" className="flex-1">
                    Call
                  </ToggleGroupItem>
                  <ToggleGroupItem value="put" className="flex-1">
                    Put
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            <div
              className={isOpenMode ? 'space-y-2' : 'space-y-2 col-span-full'}
            >
              <Label htmlFor="action">Akce</Label>
              <Select
                value={action}
                onValueChange={(v) => setAction(v as OptionAction)}
              >
                <SelectTrigger id="action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableActions.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Strike & Expiration - only in open mode */}
          {isOpenMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="strike">Strike price ($)</Label>
                <Input
                  id="strike"
                  type="number"
                  step="0.01"
                  min="0"
                  value={strikePrice}
                  onChange={(e) => setStrikePrice(e.target.value)}
                  placeholder="150.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiration">Expirace</Label>
                <Input
                  id="expiration"
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Info box for EXPIRATION */}
          {isCloseMode && action === 'EXPIRATION' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Opce expiruje bezcenná. P/L se uzavře jako{' '}
                {holding?.position === 'long'
                  ? 'ztráta zaplacené'
                  : 'zisk přijaté'}{' '}
                prémie.
              </AlertDescription>
            </Alert>
          )}

          {/* Info box for ASSIGNMENT/EXERCISE with stock transaction preview */}
          {isCloseMode && stockTransactionInfo && (
            <div className="rounded-lg p-3 bg-muted/30">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Bude vytvořena transakce
                </span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-foreground">
                  {stockTransactionInfo.type}
                </span>
              </div>

              {/* Main info */}
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-mono-price text-lg font-semibold">
                  {stockTransactionInfo.symbol}
                </span>
                <span className="text-sm text-muted-foreground">
                  {stockTransactionInfo.shares} ks
                </span>
              </div>

              {/* Price grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Cena za akcii
                  </div>
                  <div className="font-mono-price font-medium">
                    ${stockTransactionInfo.effectivePrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Celkem
                  </div>
                  <div className="font-mono-price font-medium">
                    $
                    {(
                      stockTransactionInfo.shares *
                      stockTransactionInfo.effectivePrice
                    ).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>

              {/* Formula explanation */}
              {stockTransactionInfo.isAdjusted && (
                <div className="mt-2 text-[10px] text-muted-foreground">
                  (strike ${stockTransactionInfo.strike}{' '}
                  {stockTransactionInfo.type === 'NÁKUP' ? '−' : '+'} prémium $
                  {stockTransactionInfo.avgPremium.toFixed(2)})
                </div>
              )}
            </div>
          )}

          {/* Lot selection for ASSIGNMENT (short call) / EXERCISE (long put) */}
          {isCloseMode && requiresLotSelection && (
            <div className="space-y-2">
              <Label>Vyberte lot k prodeji</Label>
              {lotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Načítám dostupné loty...
                </div>
              ) : availableLots.length === 0 ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Nemáte žádné akcie {holding?.symbol} k prodeji. Nejprve
                    musíte vlastnit akcie.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {availableLots.map((lot) => (
                    <button
                      key={lot.id}
                      type="button"
                      onClick={() => setSelectedLotId(lot.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedLotId === lot.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-mono-price font-medium">
                            {lot.remaining_shares} ks
                          </span>
                          <span className="text-muted-foreground ml-2">
                            @ {formatPrice(lot.price_per_share, lot.currency)}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(lot.date)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contracts - only show in close mode or open mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contracts">
                Počet kontraktů
                {isCloseMode && holding && (
                  <span className="text-muted-foreground ml-1">
                    (max {holding.contracts})
                  </span>
                )}
              </Label>
              <Input
                id="contracts"
                type="number"
                min="1"
                max={isCloseMode && holding ? holding.contracts : undefined}
                value={contracts}
                onChange={(e) => setContracts(e.target.value)}
              />
            </div>

            {/* Premium - only for STC/BTC/open modes */}
            {isPremiumRequired && (
              <div className="space-y-2">
                <Label htmlFor="premium">Prémie za kontrakt ($)</Label>
                <Input
                  id="premium"
                  type="number"
                  step="0.01"
                  min="0"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  placeholder="2.50"
                />
              </div>
            )}
          </div>

          {/* Transaction Date */}
          <div className="space-y-2">
            <Label htmlFor="txDate">Datum transakce</Label>
            <Input
              id="txDate"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>

          {/* Fees & Exchange Rate - hide fees for EXPIRATION, hide exchange rate for EXPIRATION */}
          {(isOpenMode || action !== 'EXPIRATION') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {action !== 'EXPIRATION' && (
                <div className="space-y-2">
                  <Label htmlFor="fees">
                    Poplatky ($)
                    <span className="text-muted-foreground ml-1">
                      (volitelné)
                    </span>
                  </Label>
                  <Input
                    id="fees"
                    type="number"
                    step="0.01"
                    min="0"
                    value={fees}
                    onChange={(e) => setFees(e.target.value)}
                    placeholder="0.65"
                  />
                </div>
              )}

              {isExchangeRateRequired && (
                <div className="space-y-2">
                  <Label htmlFor="exchangeRate">Kurz USD/CZK</Label>
                  <Input
                    id="exchangeRate"
                    type="number"
                    step="0.001"
                    min="0"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    placeholder="23.5"
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* OCC Symbol Preview - only in open mode */}
          {isOpenMode && occSymbol && (
            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-muted-foreground text-xs">
                OCC Symbol
              </Label>
              <p className="font-mono-price text-sm mt-1">{occSymbol}</p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Poznámky (volitelné)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Strategie, důvod obchodu..."
              rows={2}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Zrušit
            </Button>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {getSubmitLabel(mode, isPending)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
