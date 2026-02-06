import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { updateStock } from '@/lib/api';
import type { Stock } from '@/lib/api';
import { EXCHANGE_OPTIONS, CURRENCY_OPTIONS } from '@/lib/constants';

interface StockFormData {
  name: string;
  sector: string;
  exchange: string;
  currency: string;
  country: string;
  price_scale: number;
  notes: string;
}

interface StockFormDialogProps {
  stock: Stock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function StockFormDialog({
  stock,
  open,
  onOpenChange,
  onSuccess,
}: StockFormDialogProps) {
  const [formData, setFormData] = useState<StockFormData>({
    name: '',
    sector: '',
    exchange: '',
    currency: 'USD',
    country: '',
    price_scale: 1,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when stock changes
  useEffect(() => {
    if (stock) {
      setFormData({
        name: stock.name,
        sector: stock.sector || '',
        exchange: stock.exchange || '',
        currency: stock.currency || 'USD',
        country: stock.country || '',
        price_scale: stock.price_scale ?? 1,
        notes: stock.notes || '',
      });
      setError(null);
    }
  }, [stock]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (field: string, value: string) => {
    const actualValue = value === '_none_' ? '' : value;
    setFormData((prev) => ({ ...prev, [field]: actualValue }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stock) return;

    setSaving(true);
    setError(null);

    try {
      await updateStock(stock.id, {
        name: formData.name,
        sector: formData.sector || undefined,
        exchange: formData.exchange || undefined,
        currency: formData.currency,
        country: formData.country || undefined,
        price_scale: formData.price_scale,
        notes: formData.notes || undefined,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodařilo se uložit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upravit {stock?.ticker}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Row 1: Name */}
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
              onClick={() => onOpenChange(false)}
            >
              Zrušit
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Ukládám...' : 'Uložit změny'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
