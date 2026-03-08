import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useWatchlists } from '@/hooks/useWatchlists';
import { useCreateAlert } from '@/hooks/useAlerts';
import { generateAlertSuggestions, type AlertSuggestion } from '@/lib/api/ai_alerts';
import type { Stock } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  stocks: Stock[];
}

type Source = 'watchlist' | 'manual';

export function AlertSuggestionsPanel({ open, onClose, stocks }: Props) {
  const [source, setSource] = useState<Source>('watchlist');
  const [watchlistId, setWatchlistId] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AlertSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  const { data: watchlists = [] } = useWatchlists();
  const createAlert = useCreateAlert();

  const grouped = useMemo(() => {
    const map = new Map<string, { suggestion: AlertSuggestion; index: number }[]>();
    suggestions.forEach((s, i) => {
      const existing = map.get(s.ticker) ?? [];
      existing.push({ suggestion: s, index: i });
      map.set(s.ticker, existing);
    });
    return Array.from(map.entries());
  }, [suggestions]);

  const stockByTicker = useMemo(() => {
    const map = new Map<string, Stock>();
    stocks.forEach((s) => map.set(s.ticker, s));
    return map;
  }, [stocks]);

  const selectedCount = selected.size;
  const hasSuggestions = suggestions.length > 0;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    setSelected(new Set());

    try {
      let tickers: string[] | undefined;
      let wlId: string | undefined;

      if (source === 'watchlist') {
        if (!watchlistId) {
          setError('Vyberte watchlist.');
          return;
        }
        wlId = watchlistId;
      } else {
        tickers = manualInput
          .split(/[,\s]+/)
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean);
        if (tickers.length === 0) {
          setError('Zadejte alespoň jeden ticker.');
          return;
        }
      }

      const result = await generateAlertSuggestions(tickers, wlId);

      if (result.suggestions.length === 0) {
        setError('AI negenerovalo žádné návrhy. Zkuste jiné tickery.');
        return;
      }

      setSuggestions(result.suggestions);
      setSelected(new Set(result.suggestions.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se vygenerovat návrhy.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const toCreate = suggestions
        .map((s, i) => ({ suggestion: s, index: i }))
        .filter(({ index }) => selected.has(index));

      await Promise.all(
        toCreate.map(({ suggestion: s }) => {
          const stock = stockByTicker.get(s.ticker);
          if (!stock) return Promise.resolve();
          return createAlert.mutateAsync({
            stock_id: stock.id,
            condition_type: s.condition_type,
            condition_value: s.price,
            notes: s.reason,
            is_enabled: true,
            repeat_after_trigger: false,
          });
        }),
      );

      handleClose();
    } catch {
      // Error handled by mutation
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSource('watchlist');
    setWatchlistId('');
    setManualInput('');
    setError(null);
    setSuggestions([]);
    setSelected(new Set());
    onClose();
  };

  const toggleSelected = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Návrhy alertů od AI</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source toggle */}
          <div className="space-y-2">
            <Label>Zdroj akcií</Label>
            <ToggleGroup
              type="single"
              value={source}
              onValueChange={(v) => v && setSource(v as Source)}
              className="w-full"
            >
              <ToggleGroupItem value="watchlist" className="flex-1">
                Watchlist
              </ToggleGroupItem>
              <ToggleGroupItem value="manual" className="flex-1">
                Ručně (tickery)
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Source input */}
          {source === 'watchlist' ? (
            <div className="space-y-2">
              <Label>Watchlist</Label>
              {watchlists.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nemáte žádné watchlisty.</p>
              ) : (
                <Select value={watchlistId} onValueChange={setWatchlistId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte watchlist..." />
                  </SelectTrigger>
                  <SelectContent>
                    {watchlists.map((wl) => (
                      <SelectItem key={wl.id} value={wl.id}>
                        {wl.name}
                        {wl.item_count ? ` (${wl.item_count})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="manual-tickers">
                Tickery (oddělené čárkou nebo mezerou)
              </Label>
              <Input
                id="manual-tickers"
                placeholder="AAPL, MSFT, NVDA"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
              />
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading skeletons */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {hasSuggestions && !isLoading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Vyberte alerty k vytvoření
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      selectedCount === suggestions.length
                        ? new Set()
                        : new Set(suggestions.map((_, i) => i)),
                    )
                  }
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {selectedCount === suggestions.length ? 'Odznačit vše' : 'Vybrat vše'}
                </button>
              </div>

              {grouped.map(([ticker, items]) => {
                const stock = stockByTicker.get(ticker);
                return (
                  <div key={ticker} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1">
                      <span className="font-bold text-sm">{ticker}</span>
                      {stock && (
                        <span className="text-xs text-muted-foreground truncate">
                          {stock.name}
                        </span>
                      )}
                      {!stock && (
                        <span className="text-xs text-amber-500">
                          ticker není v databázi — alert nelze vytvořit
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {items.map(({ suggestion: s, index }) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => stock && toggleSelected(index)}
                          disabled={!stock}
                          className={`w-full rounded px-3 py-2 text-left transition-colors ${
                            !stock
                              ? 'cursor-not-allowed opacity-40'
                              : selected.has(index)
                                ? 'bg-muted/60'
                                : 'hover:bg-muted/40'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selected.has(index)}
                              disabled={!stock}
                              className="mt-0.5 pointer-events-none"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {s.condition_type === 'price_above' ? (
                                  <ArrowUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <ArrowDown className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                )}
                                <span className="font-mono-price text-sm font-medium">
                                  ${s.price.toFixed(2)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {s.condition_type === 'price_above' ? 'nad' : 'pod'}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {s.reason}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Zrušit
          </Button>
          <Button
            onClick={hasSuggestions ? handleCreate : handleGenerate}
            disabled={
              isLoading ||
              isCreating ||
              (hasSuggestions && selectedCount === 0)
            }
          >
            {isCreating
              ? 'Vytvářím...'
              : isLoading
                ? 'Generuji...'
                : hasSuggestions
                  ? `Vytvořit vybrané (${selectedCount})`
                  : 'Generovat návrhy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
