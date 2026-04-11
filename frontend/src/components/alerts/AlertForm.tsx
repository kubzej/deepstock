import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ArrowUp, ArrowDown, ArrowUpDown, Percent } from 'lucide-react';
import type { PriceAlert } from '@/hooks/useAlerts';
import type { AlertFormData, FormConditionType, RangeAlertItem } from './types';

interface Stock {
  id: string;
  ticker: string;
  name: string;
}

interface AlertFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: AlertFormData;
  setFormData: (data: AlertFormData) => void;
  editingAlert: PriceAlert | null;
  editingRangeAlert: RangeAlertItem | null;
  stocks: Stock[];
  stockSearch: string;
  setStockSearch: (value: string) => void;
  onSubmit: () => void;
  createPending: boolean;
  updatePending: boolean;
}

export function AlertForm({
  open,
  onOpenChange,
  formData,
  setFormData,
  editingAlert,
  editingRangeAlert,
  stocks,
  stockSearch,
  setStockSearch,
  onSubmit,
  createPending,
  updatePending,
}: AlertFormProps) {
  const filteredStocks = stockSearch
    ? stocks
        .filter(
          (s) =>
            s.ticker?.toLowerCase().includes(stockSearch.toLowerCase()) ||
            s.name?.toLowerCase().includes(stockSearch.toLowerCase()),
        )
        .slice(0, 50)
    : stocks.slice(0, 50);

  const isSubmitDisabled =
    (!formData.stock_id && !editingAlert && !editingRangeAlert) ||
    (formData.condition_type === 'price_both'
      ? !formData.price_above_value || !formData.price_below_value
      : !formData.condition_value) ||
    createPending ||
    updatePending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingRangeAlert
              ? 'Upravit cenové pásmo'
              : editingAlert
                ? 'Upravit alert'
                : 'Nový cenový alert'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Stock selection */}
          {!editingAlert && !editingRangeAlert && (
            <div className="space-y-2">
              <Label>Akcie</Label>
              <Input
                placeholder="Hledat ticker nebo název..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
              />
              {stockSearch && filteredStocks.length > 0 && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {filteredStocks.map((stock) => (
                    <button
                      key={stock.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 hover:bg-muted text-sm ${
                        formData.stock_id === stock.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => {
                        setFormData({ ...formData, stock_id: stock.id });
                        setStockSearch(`${stock.ticker} - ${stock.name}`);
                      }}
                    >
                      <span className="font-mono font-medium">{stock.ticker}</span>{' '}
                      <span className="text-muted-foreground">{stock.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {editingAlert && (
            <div className="text-sm text-muted-foreground">
              {editingAlert.stocks?.ticker} - {editingAlert.stocks?.name}
            </div>
          )}

          {editingRangeAlert && (
            <div className="text-sm text-muted-foreground">
              {editingRangeAlert.stocks?.ticker} - {editingRangeAlert.stocks?.name}
            </div>
          )}

          {/* Condition type */}
          {editingRangeAlert ? (
            <div className="space-y-2">
              <Label>Podmínka</Label>
              <ToggleGroup
                type="single"
                value="price_both"
                className="w-full"
              >
                <ToggleGroupItem
                  value="price_both"
                  disabled
                  className="flex-1 gap-1.5 border-violet-600 bg-violet-600 text-white disabled:opacity-100"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Cenové pásmo
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Podmínka</Label>
              <ToggleGroup
                type="single"
                value={formData.condition_type}
                onValueChange={(v) =>
                  v && setFormData({ ...formData, condition_type: v as FormConditionType })
                }
                className="w-full"
              >
                <ToggleGroupItem
                  value="price_above"
                  className="flex-1 gap-1.5 data-[state=on]:bg-emerald-600 data-[state=on]:text-white"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Nad
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="price_below"
                  className="flex-1 gap-1.5 data-[state=on]:bg-rose-600 data-[state=on]:text-white"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  Pod
                </ToggleGroupItem>
                {!editingAlert && (
                  <ToggleGroupItem
                    value="price_both"
                    className="flex-1 gap-1.5 data-[state=on]:bg-violet-600 data-[state=on]:text-white"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Obě
                  </ToggleGroupItem>
                )}
                <ToggleGroupItem
                  value="percent_change_day"
                  className="flex-1 gap-1.5 data-[state=on]:bg-blue-600 data-[state=on]:text-white"
                >
                  <Percent className="h-3.5 w-3.5" />
                  ±%
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          {/* Condition value(s) */}
          {formData.condition_type === 'price_both' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ArrowDown className="h-3.5 w-3.5 text-negative" />
                  Dolní hranice - pod ($)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="90.00"
                  value={formData.price_below_value}
                  onChange={(e) => setFormData({ ...formData, price_below_value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ArrowUp className="h-3.5 w-3.5 text-positive" />
                  Horní hranice - nad ($)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="110.00"
                  value={formData.price_above_value}
                  onChange={(e) => setFormData({ ...formData, price_above_value: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>
                {formData.condition_type === 'percent_change_day' ? 'Práh změny (%)' : 'Cílová cena ($)'}
              </Label>
              <Input
                type="number"
                step={formData.condition_type === 'percent_change_day' ? '0.1' : '0.01'}
                min="0"
                placeholder={formData.condition_type === 'percent_change_day' ? '5' : '100.00'}
                value={formData.condition_value}
                onChange={(e) => setFormData({ ...formData, condition_value: e.target.value })}
              />
            </div>
          )}

          {/* Options */}
          <div className="flex items-center justify-between">
            <Label htmlFor="repeat">Opakovat po spuštění</Label>
            <Switch
              id="repeat"
              checked={formData.repeat_after_trigger}
              onCheckedChange={(v) => setFormData({ ...formData, repeat_after_trigger: v })}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Poznámka (volitelné)</Label>
            <Textarea
              placeholder="Např. důvod pro alert..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitDisabled}>
            {editingAlert || editingRangeAlert ? 'Uložit' : 'Vytvořit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
