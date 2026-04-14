/**
 * WatchlistItemFormDialog - Add/Edit watchlist item form
 */
import { useState, useEffect } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Loader2 } from 'lucide-react';
import { type WatchlistItem, type Holding } from '@/lib/api';
import { generateWatchlistTargets } from '@/lib/api/ai_watchlist_targets';
import { formatPrice } from '@/lib/format';

interface WatchlistItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: WatchlistItem | null;
  onSave: (data: WatchlistItemFormData) => Promise<void>;
  saving?: boolean;
  holding?: Holding | null;
  watchlists?: Array<{ id: string; name: string }>;
  selectedWatchlistId?: string | null;
  onSelectedWatchlistChange?: (watchlistId: string) => void;
  initialTicker?: string;
  initialSector?: string | null;
}

export interface WatchlistItemFormData {
  ticker: string;
  buyTarget: string;
  sellTarget: string;
  notes: string;
  sector: string;
}

export function WatchlistItemFormDialog({
  open,
  onOpenChange,
  editingItem,
  onSave,
  saving = false,
  holding,
  watchlists,
  selectedWatchlistId,
  onSelectedWatchlistChange,
  initialTicker,
  initialSector,
}: WatchlistItemFormDialogProps) {
  // Form state
  const [ticker, setTicker] = useState('');
  const [buyTarget, setBuyTarget] = useState('');
  const [sellTarget, setSellTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [sector, setSector] = useState('');

  // AI suggestion state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or editingItem changes
  useEffect(() => {
    if (open) {
      if (editingItem) {
        setTicker(editingItem.stocks.ticker);
        setBuyTarget(editingItem.target_buy_price?.toString() || '');
        setSellTarget(editingItem.target_sell_price?.toString() || '');
        setNotes(editingItem.notes || '');
        setSector(editingItem.sector || editingItem.stocks.sector || '');
      } else {
        setTicker(initialTicker?.trim().toUpperCase() || '');
        setBuyTarget('');
        setSellTarget('');
        setNotes('');
        setSector(initialSector || '');
      }
      setAiError(null);
    }
  }, [open, editingItem, initialSector, initialTicker]);

  const handleSubmit = async () => {
    await onSave({
      ticker,
      buyTarget,
      sellTarget,
      notes,
      sector,
    });
  };

  const handleAiSuggest = async () => {
    const resolvedTicker = editingItem?.stocks.ticker || ticker.trim().toUpperCase();
    if (!resolvedTicker) return;

    setAiLoading(true);
    setAiError(null);
    try {
      const result = await generateWatchlistTargets({
        ticker: resolvedTicker,
        avg_cost: holding?.avg_cost ?? undefined,
        shares: holding?.shares ?? undefined,
      });

      if (result.buy_target !== null) {
        setBuyTarget(result.buy_target.toString());
      }
      if (result.sell_target !== null) {
        setSellTarget(result.sell_target.toString());
      }
      if (result.comment) {
        setNotes((prev) => {
          const aiNote = `[AI] ${result.comment}`;
          return prev ? `${prev}\n\n${aiNote}` : aiNote;
        });
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Nepodařilo se načíst doporučení.');
    } finally {
      setAiLoading(false);
    }
  };

  const hasWatchlistSelection =
    editingItem || !watchlists?.length || !!selectedWatchlistId;
  const isValid = (editingItem || ticker.trim().length > 0) && hasWatchlistSelection;
  const canAiSuggest = !!(editingItem?.stocks.ticker || ticker.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editingItem
              ? `Upravit ${editingItem.stocks.ticker}`
              : 'Přidat akcii'}
          </DialogTitle>
          <DialogDescription>
            {editingItem
              ? 'Upravte cíle a poznámky k této akcii.'
              : 'Přidejte novou akcii do watchlistu.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 py-2">
          {!editingItem && watchlists && watchlists.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="watchlist">Watchlist</Label>
              <Select
                value={selectedWatchlistId ?? undefined}
                onValueChange={onSelectedWatchlistChange}
              >
                <SelectTrigger id="watchlist" className="w-full">
                  <SelectValue placeholder="Vyberte watchlist..." />
                </SelectTrigger>
                <SelectContent>
                  {watchlists.map((watchlist) => (
                    <SelectItem key={watchlist.id} value={watchlist.id}>
                      {watchlist.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!editingItem && (
            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="font-mono-price"
              />
            </div>
          )}

          {/* AI suggestion button */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAiSuggest}
              disabled={aiLoading || !canAiSuggest}
              className="gap-1.5 text-xs"
            >
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {aiLoading ? 'Analyzuji...' : 'AI doporučení'}
            </Button>
            {holding && (
              <span className="text-xs text-muted-foreground">
                Držíš za avg. {formatPrice(holding.avg_cost, holding.currency)}
              </span>
            )}
          </div>
          {aiError && (
            <p className="text-xs text-destructive">{aiError}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buyTarget">Nákupní cíl</Label>
              <Input
                id="buyTarget"
                type="number"
                step="0.01"
                value={buyTarget}
                onChange={(e) => setBuyTarget(e.target.value)}
                placeholder="150.00"
                className="font-mono-price"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sellTarget">Prodejní cíl</Label>
              <Input
                id="sellTarget"
                type="number"
                step="0.01"
                value={sellTarget}
                onChange={(e) => setSellTarget(e.target.value)}
                placeholder="200.00"
                className="font-mono-price"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sector">Sektor</Label>
            <Input
              id="sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Technology"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Poznámky</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Proč sleduji tuto akcii..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !isValid}>
            {saving ? 'Ukládám...' : editingItem ? 'Uložit' : 'Přidat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
