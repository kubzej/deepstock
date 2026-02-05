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
import { AlertCircle, Loader2 } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  useCreateOptionTransaction,
  useCloseOptionPosition,
} from '@/lib/optionsHooks';
import type { OptionType, OptionAction, OptionHolding } from '@/lib/api';

// ============ Types ============

export type ModalMode = 'open' | 'close';

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

  // Available actions based on mode
  const availableActions = useMemo(() => {
    if (isCloseMode && holding) {
      // In close mode, show appropriate closing actions based on position type
      return holding.position === 'long'
        ? LONG_CLOSE_ACTIONS
        : SHORT_CLOSE_ACTIONS;
    }
    // Open mode - only opening actions
    return OPEN_ACTIONS;
  }, [isCloseMode, holding]);

  // Initialize form based on mode
  const initializeForm = useCallback(() => {
    if (isCloseMode && holding) {
      // Close mode: populate from holding, but new transaction data
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
    } else {
      // Open mode: reset to defaults
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
    }
  }, [isCloseMode, holding]);

  // Initialize form when modal opens or mode changes
  useEffect(() => {
    if (open) {
      initializeForm();
    }
  }, [open, initializeForm]);

  // Handle modal close
  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  // Generate OCC symbol
  const occSymbol = useMemo(
    () => generateOccSymbol(ticker, expirationDate, strikePrice, optionType),
    [ticker, expirationDate, strikePrice, optionType],
  );

  // Check if premium is required (not for EXPIRATION)
  const isPremiumRequired = action !== 'EXPIRATION';

  // Validation
  const isValid = useMemo(() => {
    if (
      !ticker ||
      !strikePrice ||
      !expirationDate ||
      !contracts ||
      !transactionDate ||
      !exchangeRate
    ) {
      return false;
    }
    if (isPremiumRequired && !premium) {
      return false;
    }
    // In close mode, can't close more contracts than available
    if (isCloseMode && holding && parseInt(contracts, 10) > holding.contracts) {
      return false;
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
    isPremiumRequired,
    isCloseMode,
    holding,
  ]);

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!portfolio?.id || !isValid) return;

    try {
      if (isCloseMode && holding) {
        // Close position using the close endpoint
        await closeMutation.mutateAsync({
          portfolioId: portfolio.id,
          optionSymbol: holding.option_symbol,
          closingAction: action,
          contracts: parseInt(contracts, 10),
          closeDate: transactionDate,
          premium: premium ? parseFloat(premium) : undefined,
          fees: fees ? parseFloat(fees) : undefined,
          exchangeRateToCzk: parseFloat(exchangeRate),
          notes: notes || undefined,
        });
      } else {
        // Create new transaction
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
                <span className="font-mono font-medium">
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
          <div className="space-y-2">
            <Label htmlFor="ticker">Ticker podkladu</Label>
            <Input
              id="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              autoComplete="off"
              disabled={isCloseMode}
            />
          </div>

          {/* Option Type & Action */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Typ opce</Label>
              <ToggleGroup
                type="single"
                value={optionType}
                onValueChange={(v) => v && setOptionType(v as OptionType)}
                className="w-full"
                disabled={isCloseMode}
              >
                <ToggleGroupItem value="call" className="flex-1">
                  Call
                </ToggleGroupItem>
                <ToggleGroupItem value="put" className="flex-1">
                  Put
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-2">
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

          {/* Strike & Expiration - disabled in close mode */}
          <div className="grid grid-cols-2 gap-4">
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
                disabled={isCloseMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiration">Expirace</Label>
              <Input
                id="expiration"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                disabled={isCloseMode}
              />
            </div>
          </div>

          {/* Contracts & Premium */}
          <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="premium">
                Prémie za kontrakt ($)
                {!isPremiumRequired && (
                  <span className="text-muted-foreground ml-1">
                    (volitelné)
                  </span>
                )}
              </Label>
              <Input
                id="premium"
                type="number"
                step="0.01"
                min="0"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                placeholder={action === 'EXPIRATION' ? '0.00' : '2.50'}
              />
            </div>
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

          {/* Fees & Exchange Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fees">
                Poplatky ($)
                <span className="text-muted-foreground ml-1">(volitelné)</span>
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
          </div>

          {/* OCC Symbol Preview - only in open mode */}
          {isOpenMode && occSymbol && (
            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-muted-foreground text-xs">
                OCC Symbol
              </Label>
              <p className="font-mono text-sm mt-1">{occSymbol}</p>
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
