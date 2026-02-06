/**
 * WatchlistItemFormDialog - Add/Edit watchlist item form
 */
import { useState, useEffect } from 'react';
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
import { type WatchlistItem } from '@/lib/api';

interface WatchlistItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: WatchlistItem | null;
  onSave: (data: WatchlistItemFormData) => Promise<void>;
  saving?: boolean;
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
}: WatchlistItemFormDialogProps) {
  // Form state
  const [ticker, setTicker] = useState('');
  const [buyTarget, setBuyTarget] = useState('');
  const [sellTarget, setSellTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [sector, setSector] = useState('');

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
        setTicker('');
        setBuyTarget('');
        setSellTarget('');
        setNotes('');
        setSector('');
      }
    }
  }, [open, editingItem]);

  const handleSubmit = async () => {
    await onSave({
      ticker,
      buyTarget,
      sellTarget,
      notes,
      sector,
    });
  };

  const isValid = editingItem || ticker.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? `Upravit ${editingItem.stocks.ticker}` : 'Přidat akcii'}
          </DialogTitle>
          <DialogDescription>
            {editingItem
              ? 'Upravte cíle a poznámky k této akcii.'
              : 'Přidejte novou akcii do watchlistu.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 py-2">
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
          <div className="grid grid-cols-2 gap-4">
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
