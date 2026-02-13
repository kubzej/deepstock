import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { useStocks } from '@/hooks/useStocks';
import { useQuotes } from '@/hooks/useQuotes';
import {
  useAlerts,
  useCreateAlert,
  useUpdateAlert,
  useDeleteAlert,
  useResetAlert,
  useToggleAlert,
  type PriceAlert,
  type PriceAlertCreate,
} from '@/hooks/useAlerts';
import { queryKeys } from '@/lib/queryClient';
import type { AlertConditionType } from '@/lib/api';
import {
  Plus,
  Bell,
  Trash2,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Percent,
  Check,
  Pencil,
} from 'lucide-react';

type FilterView = 'active' | 'inactive';

const CONDITION_ICONS: Record<AlertConditionType, React.ReactNode> = {
  price_above: <ArrowUp className="h-4 w-4 text-emerald-500" />,
  price_below: <ArrowDown className="h-4 w-4 text-rose-500" />,
  percent_change_day: <Percent className="h-4 w-4 text-blue-500" />,
};

interface AlertFormData {
  stock_id: string;
  condition_type: AlertConditionType;
  condition_value: string;
  is_enabled: boolean;
  repeat_after_trigger: boolean;
  notes: string;
}

const EMPTY_FORM: AlertFormData = {
  stock_id: '',
  condition_type: 'price_above',
  condition_value: '',
  is_enabled: true,
  repeat_after_trigger: false,
  notes: '',
};

function formatConditionValue(
  conditionType: AlertConditionType,
  value: number,
): string {
  if (conditionType === 'percent_change_day') {
    return `±${Math.abs(value).toFixed(1)}%`;
  }
  return `$${value.toFixed(2)}`;
}

export function AlertsPage() {
  const queryClient = useQueryClient();

  // Data hooks
  const {
    data: alerts = [],
    isLoading: alertsLoading,
    isFetching: alertsFetching,
    dataUpdatedAt,
    error: alertsError,
  } = useAlerts();

  const { data: stocks = [] } = useStocks();

  // Get tickers for active alerts to fetch quotes
  const alertTickers = useMemo(() => {
    return [...new Set(alerts.map((a) => a.stocks?.ticker).filter(Boolean))];
  }, [alerts]);

  const { data: quotes = {} } = useQuotes(alertTickers);

  // Mutations
  const createMutation = useCreateAlert();
  const updateMutation = useUpdateAlert();
  const deleteMutation = useDeleteAlert();
  const resetMutation = useResetAlert();
  const toggleMutation = useToggleAlert();

  // Local state
  const [filterView, setFilterView] = useState<FilterView>('active');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null);
  const [formData, setFormData] = useState<AlertFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<PriceAlert | null>(null);
  const [stockSearch, setStockSearch] = useState('');

  // Filter alerts based on view
  const filteredAlerts = useMemo(() => {
    switch (filterView) {
      case 'active':
        return alerts.filter((a) => a.is_enabled && !a.is_triggered);
      case 'inactive':
        return alerts.filter((a) => !a.is_enabled || a.is_triggered);
      default:
        return alerts;
    }
  }, [alerts, filterView]);

  // Filtered stocks for dropdown
  const filteredStocks = useMemo(() => {
    if (!stockSearch) return stocks.slice(0, 50);
    const search = stockSearch.toLowerCase();
    return stocks
      .filter(
        (s) =>
          s.ticker?.toLowerCase().includes(search) ||
          s.name?.toLowerCase().includes(search),
      )
      .slice(0, 50);
  }, [stocks, stockSearch]);

  // Handlers
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
  };

  const openCreateForm = () => {
    setEditingAlert(null);
    setFormData(EMPTY_FORM);
    setStockSearch('');
    setIsFormOpen(true);
  };

  const openEditForm = (alert: PriceAlert) => {
    setEditingAlert(alert);
    setFormData({
      stock_id: alert.stock_id,
      condition_type: alert.condition_type,
      condition_value: String(alert.condition_value),
      is_enabled: alert.is_enabled,
      repeat_after_trigger: alert.repeat_after_trigger,
      notes: alert.notes || '',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    const value = parseFloat(formData.condition_value);
    if (isNaN(value) || value <= 0) return;
    if (!formData.stock_id) return;

    const data: PriceAlertCreate = {
      stock_id: formData.stock_id,
      condition_type: formData.condition_type,
      condition_value: value,
      is_enabled: formData.is_enabled,
      repeat_after_trigger: formData.repeat_after_trigger,
      notes: formData.notes || null,
    };

    try {
      if (editingAlert) {
        await updateMutation.mutateAsync({
          id: editingAlert.id,
          data: {
            condition_type: data.condition_type,
            condition_value: data.condition_value,
            is_enabled: data.is_enabled,
            repeat_after_trigger: data.repeat_after_trigger,
            notes: data.notes,
          },
        });
      } else {
        await createMutation.mutateAsync(data);
      }
      setIsFormOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggle = async (alert: PriceAlert) => {
    await toggleMutation.mutateAsync(alert.id);
  };

  const handleReset = async (alert: PriceAlert) => {
    await resetMutation.mutateAsync(alert.id);
  };

  // Count stats
  const activeCount = alerts.filter(
    (a) => a.is_enabled && !a.is_triggered,
  ).length;
  const inactiveCount = alerts.filter(
    (a) => !a.is_enabled || a.is_triggered,
  ).length;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Cenové alerty"
        onRefresh={handleRefresh}
        isRefreshing={alertsFetching}
        dataUpdatedAt={dataUpdatedAt}
      />

      {/* Error */}
      {alertsError && (
        <Alert variant="destructive">
          <AlertDescription>
            {alertsError instanceof Error
              ? alertsError.message
              : 'Nepodařilo se načíst alerty'}
          </AlertDescription>
        </Alert>
      )}

      {/* Filter Pills + Add button */}
      <div className="flex items-center gap-3 flex-wrap">
        <PillGroup>
          <PillButton
            active={filterView === 'active'}
            onClick={() => setFilterView('active')}
          >
            Aktivní ({activeCount})
          </PillButton>
          <PillButton
            active={filterView === 'inactive'}
            onClick={() => setFilterView('inactive')}
          >
            Neaktivní ({inactiveCount})
          </PillButton>
        </PillGroup>
        <div className="flex-1" />
        <Button onClick={openCreateForm} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nový alert
        </Button>
      </div>

      {/* Loading */}
      {alertsLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!alertsLoading && filteredAlerts.length === 0 && (
        <EmptyState
          icon={Bell}
          title={
            filterView === 'active'
              ? 'Žádné aktivní alerty'
              : 'Žádné neaktivní alerty'
          }
          description={
            filterView === 'active'
              ? 'Vytvořte si alert na cenu akcie'
              : 'Všechny alerty jsou aktivní'
          }
          action={
            filterView === 'active'
              ? { label: 'Vytvořit alert', onClick: openCreateForm }
              : undefined
          }
        />
      )}

      {/* Alerts list */}
      {!alertsLoading && filteredAlerts.length > 0 && (
        <div className="space-y-2">
          {filteredAlerts.map((alert) => {
            const quote = quotes[alert.stocks?.ticker];
            const currentPrice = quote?.price;

            return (
              <div
                key={alert.id}
                className={`rounded-xl px-3 py-2.5 ${
                  alert.is_triggered
                    ? 'bg-amber-500/10'
                    : alert.is_enabled
                      ? 'bg-muted/30'
                      : 'bg-muted/20 opacity-60'
                }`}
              >
                {/* Row 1: Ticker + Condition + Actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-bold text-sm">
                      {alert.stocks?.ticker || 'N/A'}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                      {alert.stocks?.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">·</span>
                    <div className="flex items-center gap-1">
                      {CONDITION_ICONS[alert.condition_type]}
                      <span className="font-mono-price text-sm">
                        {formatConditionValue(
                          alert.condition_type,
                          alert.condition_value,
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {alert.is_triggered ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleReset(alert)}
                        disabled={resetMutation.isPending}
                        title="Reset"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Switch
                        checked={alert.is_enabled}
                        onCheckedChange={() => handleToggle(alert)}
                        disabled={toggleMutation.isPending}
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditForm(alert)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDeleteConfirm(alert)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Row 2: Current price + status badges */}
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[11px] text-muted-foreground font-mono-price">
                    {currentPrice ? `$${currentPrice.toFixed(2)}` : '—'}
                    {alert.repeat_after_trigger && (
                      <span className="ml-2">
                        <RotateCcw className="h-3 w-3 inline mr-0.5" />
                        opakující
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {alert.is_triggered && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-[18px] text-amber-500 border-amber-500/30"
                      >
                        <Check className="h-3 w-3 mr-0.5" />
                        Dokončeno
                      </Badge>
                    )}
                    {!alert.is_enabled && !alert.is_triggered && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-[18px] text-muted-foreground"
                      >
                        Vypnuto
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAlert ? 'Upravit alert' : 'Nový cenový alert'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Stock selection */}
            {!editingAlert && (
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
                        <span className="font-mono font-medium">
                          {stock.ticker}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {stock.name}
                        </span>
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

            {/* Condition type */}
            <div className="space-y-2">
              <Label>Podmínka</Label>
              <Select
                value={formData.condition_type}
                onValueChange={(v: AlertConditionType) =>
                  setFormData({ ...formData, condition_type: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price_above">
                    <div className="flex items-center gap-2">
                      <ArrowUp className="h-4 w-4 text-emerald-500" />
                      Cena nad
                    </div>
                  </SelectItem>
                  <SelectItem value="price_below">
                    <div className="flex items-center gap-2">
                      <ArrowDown className="h-4 w-4 text-rose-500" />
                      Cena pod
                    </div>
                  </SelectItem>
                  <SelectItem value="percent_change_day">
                    <div className="flex items-center gap-2">
                      <Percent className="h-4 w-4 text-blue-500" />
                      Denní změna ±%
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Condition value */}
            <div className="space-y-2">
              <Label>
                {formData.condition_type === 'percent_change_day'
                  ? 'Práh změny (%)'
                  : 'Cílová cena ($)'}
              </Label>
              <Input
                type="number"
                step={
                  formData.condition_type === 'percent_change_day'
                    ? '0.1'
                    : '0.01'
                }
                min="0"
                placeholder={
                  formData.condition_type === 'percent_change_day'
                    ? '5'
                    : '100.00'
                }
                value={formData.condition_value}
                onChange={(e) =>
                  setFormData({ ...formData, condition_value: e.target.value })
                }
              />
              {formData.condition_type === 'percent_change_day' && (
                <p className="text-xs text-muted-foreground">
                  Alert se spustí při změně ±{formData.condition_value || '0'}%
                  za den
                </p>
              )}
            </div>

            {/* Options */}
            <div className="flex items-center justify-between">
              <Label htmlFor="repeat">Opakovat po spuštění</Label>
              <Switch
                id="repeat"
                checked={formData.repeat_after_trigger}
                onCheckedChange={(v) =>
                  setFormData({ ...formData, repeat_after_trigger: v })
                }
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Poznámka (volitelné)</Label>
              <Textarea
                placeholder="Např. důvod pro alert..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Zrušit
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.stock_id ||
                !formData.condition_value ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {editingAlert ? 'Uložit' : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Smazat alert?"
        description={`Opravdu chcete smazat alert pro ${deleteConfirm?.stocks?.ticker}?`}
        confirmLabel="Smazat"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}
