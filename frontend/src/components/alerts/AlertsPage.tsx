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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  useDeleteGroup,
  useResetGroup,
  useToggleGroup,
  type PriceAlert,
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
  ArrowUpDown,
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

// Extended type to include "both" option for creating 2 alerts at once
type FormConditionType = AlertConditionType | 'price_both';

interface AlertFormData {
  stock_id: string;
  condition_type: FormConditionType;
  condition_value: string;
  // For "both" mode - separate values for above/below
  price_above_value: string;
  price_below_value: string;
  is_enabled: boolean;
  repeat_after_trigger: boolean;
  notes: string;
}

const EMPTY_FORM: AlertFormData = {
  stock_id: '',
  condition_type: 'price_above',
  condition_value: '',
  price_above_value: '',
  price_below_value: '',
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

// Czech pluralization for "alert"
function pluralizeAlert(count: number): string {
  if (count === 1) return 'alert';
  if (count >= 2 && count <= 4) return 'alerty';
  return 'alertů';
}

// Display item type - either a single alert or a grouped range alert
interface SingleAlertItem {
  type: 'single';
  alert: PriceAlert;
}

interface RangeAlertItem {
  type: 'range';
  groupId: string;
  aboveAlert: PriceAlert;
  belowAlert: PriceAlert;
  // Aggregate state from both alerts
  is_enabled: boolean;
  is_triggered: boolean;
  repeat_after_trigger: boolean;
  notes: string | null;
  stocks: { ticker: string; name: string };
}

type AlertDisplayItem = SingleAlertItem | RangeAlertItem;

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

  // Group mutations
  const deleteGroupMutation = useDeleteGroup();
  const resetGroupMutation = useResetGroup();
  const toggleGroupMutation = useToggleGroup();

  // Local state
  const [filterView, setFilterView] = useState<FilterView>('active');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null);
  const [editingRangeAlert, setEditingRangeAlert] =
    useState<RangeAlertItem | null>(null);
  const [formData, setFormData] = useState<AlertFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<AlertDisplayItem | null>(
    null,
  );
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

  // Group alerts by ticker and create display items (merging range alerts)
  const groupedDisplayItems = useMemo(() => {
    // First, identify grouped alerts by group_id
    const groupMap = new Map<string, PriceAlert[]>();
    const ungroupedAlerts: PriceAlert[] = [];

    for (const alert of filteredAlerts) {
      if (alert.group_id) {
        const existing = groupMap.get(alert.group_id) || [];
        existing.push(alert);
        groupMap.set(alert.group_id, existing);
      } else {
        ungroupedAlerts.push(alert);
      }
    }

    // Create display items
    const displayItems: AlertDisplayItem[] = [];

    // Process grouped alerts (range alerts)
    for (const [groupId, groupAlerts] of groupMap) {
      const aboveAlert = groupAlerts.find(
        (a) => a.condition_type === 'price_above',
      );
      const belowAlert = groupAlerts.find(
        (a) => a.condition_type === 'price_below',
      );

      if (aboveAlert && belowAlert) {
        // Valid range - create merged display
        displayItems.push({
          type: 'range',
          groupId,
          aboveAlert,
          belowAlert,
          is_enabled: aboveAlert.is_enabled && belowAlert.is_enabled,
          is_triggered: aboveAlert.is_triggered || belowAlert.is_triggered,
          repeat_after_trigger: aboveAlert.repeat_after_trigger,
          notes: aboveAlert.notes,
          stocks: aboveAlert.stocks,
        });
      } else {
        // Incomplete group - show as singles
        groupAlerts.forEach((a) =>
          displayItems.push({ type: 'single', alert: a }),
        );
      }
    }

    // Add ungrouped alerts
    for (const alert of ungroupedAlerts) {
      displayItems.push({ type: 'single', alert });
    }

    // Group by ticker for display
    const tickerGroups: Record<string, AlertDisplayItem[]> = {};
    for (const item of displayItems) {
      const ticker =
        item.type === 'single'
          ? item.alert.stocks?.ticker || 'N/A'
          : item.stocks?.ticker || 'N/A';
      if (!tickerGroups[ticker]) {
        tickerGroups[ticker] = [];
      }
      tickerGroups[ticker].push(item);
    }

    // Sort items within each ticker
    for (const ticker of Object.keys(tickerGroups)) {
      tickerGroups[ticker].sort((a, b) => {
        const aValue =
          a.type === 'single'
            ? a.alert.condition_value
            : Math.min(
                a.aboveAlert.condition_value,
                a.belowAlert.condition_value,
              );
        const bValue =
          b.type === 'single'
            ? b.alert.condition_value
            : Math.min(
                b.aboveAlert.condition_value,
                b.belowAlert.condition_value,
              );
        return aValue - bValue;
      });
    }

    // Sort by ticker
    return Object.entries(tickerGroups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAlerts]);

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
    setEditingRangeAlert(null);
    setFormData(EMPTY_FORM);
    setStockSearch('');
    setIsFormOpen(true);
  };

  const openEditForm = (alert: PriceAlert) => {
    setEditingAlert(alert);
    setEditingRangeAlert(null);
    setFormData({
      stock_id: alert.stock_id,
      condition_type: alert.condition_type,
      condition_value: String(alert.condition_value),
      price_above_value: '',
      price_below_value: '',
      is_enabled: alert.is_enabled,
      repeat_after_trigger: alert.repeat_after_trigger,
      notes: alert.notes || '',
    });
    setIsFormOpen(true);
  };

  const openEditRangeForm = (range: RangeAlertItem) => {
    setEditingAlert(null);
    setEditingRangeAlert(range);
    setFormData({
      stock_id: range.aboveAlert.stock_id,
      condition_type: 'price_both',
      condition_value: '',
      price_above_value: String(range.aboveAlert.condition_value),
      price_below_value: String(range.belowAlert.condition_value),
      is_enabled: range.is_enabled,
      repeat_after_trigger: range.repeat_after_trigger,
      notes: range.notes || '',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.stock_id && !editingAlert && !editingRangeAlert) return;

    // Validate values based on mode
    if (formData.condition_type === 'price_both') {
      const aboveValue = parseFloat(formData.price_above_value);
      const belowValue = parseFloat(formData.price_below_value);
      if (isNaN(aboveValue) || aboveValue <= 0) return;
      if (isNaN(belowValue) || belowValue <= 0) return;
    } else {
      const value = parseFloat(formData.condition_value);
      if (isNaN(value) || value <= 0) return;
    }

    try {
      if (editingRangeAlert) {
        // Edit mode - update both alerts in the range
        const aboveValue = parseFloat(formData.price_above_value);
        const belowValue = parseFloat(formData.price_below_value);
        await Promise.all([
          updateMutation.mutateAsync({
            id: editingRangeAlert.aboveAlert.id,
            data: {
              condition_value: aboveValue,
              is_enabled: formData.is_enabled,
              repeat_after_trigger: formData.repeat_after_trigger,
              notes: formData.notes || null,
            },
          }),
          updateMutation.mutateAsync({
            id: editingRangeAlert.belowAlert.id,
            data: {
              condition_value: belowValue,
              is_enabled: formData.is_enabled,
              repeat_after_trigger: formData.repeat_after_trigger,
              notes: formData.notes || null,
            },
          }),
        ]);
      } else if (editingAlert) {
        // Edit mode - single update
        const value = parseFloat(formData.condition_value);
        await updateMutation.mutateAsync({
          id: editingAlert.id,
          data: {
            condition_type: formData.condition_type as AlertConditionType,
            condition_value: value,
            is_enabled: formData.is_enabled,
            repeat_after_trigger: formData.repeat_after_trigger,
            notes: formData.notes || null,
          },
        });
      } else if (formData.condition_type === 'price_both') {
        // Create 2 alerts with different prices: above and below
        // Generate shared group_id for linking them
        const groupId = crypto.randomUUID();
        const aboveValue = parseFloat(formData.price_above_value);
        const belowValue = parseFloat(formData.price_below_value);
        const baseData = {
          stock_id: formData.stock_id,
          is_enabled: formData.is_enabled,
          repeat_after_trigger: formData.repeat_after_trigger,
          notes: formData.notes || null,
          group_id: groupId,
        };
        await Promise.all([
          createMutation.mutateAsync({
            ...baseData,
            condition_type: 'price_above',
            condition_value: aboveValue,
          }),
          createMutation.mutateAsync({
            ...baseData,
            condition_type: 'price_below',
            condition_value: belowValue,
          }),
        ]);
      } else {
        // Single alert creation
        const value = parseFloat(formData.condition_value);
        await createMutation.mutateAsync({
          stock_id: formData.stock_id,
          condition_type: formData.condition_type as AlertConditionType,
          condition_value: value,
          is_enabled: formData.is_enabled,
          repeat_after_trigger: formData.repeat_after_trigger,
          notes: formData.notes || null,
        });
      }
      setIsFormOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'range') {
        await deleteGroupMutation.mutateAsync(deleteConfirm.groupId);
      } else {
        await deleteMutation.mutateAsync(deleteConfirm.alert.id);
      }
      setDeleteConfirm(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggle = async (item: AlertDisplayItem) => {
    if (item.type === 'range') {
      await toggleGroupMutation.mutateAsync(item.groupId);
    } else {
      await toggleMutation.mutateAsync(item.alert.id);
    }
  };

  const handleReset = async (item: AlertDisplayItem) => {
    if (item.type === 'range') {
      await resetGroupMutation.mutateAsync(item.groupId);
    } else {
      await resetMutation.mutateAsync(item.alert.id);
    }
  };

  // Count stats - count groups as 1 item based on combined group state
  const { activeCount, inactiveCount } = useMemo(() => {
    // Group alerts by group_id
    const groupMap = new Map<string, PriceAlert[]>();
    const ungrouped: PriceAlert[] = [];

    for (const alert of alerts) {
      if (alert.group_id) {
        const existing = groupMap.get(alert.group_id) || [];
        existing.push(alert);
        groupMap.set(alert.group_id, existing);
      } else {
        ungrouped.push(alert);
      }
    }

    let active = 0;
    let inactive = 0;

    // Count grouped alerts - group is active only if ALL alerts are active
    for (const groupAlerts of groupMap.values()) {
      const isGroupEnabled = groupAlerts.every((a) => a.is_enabled);
      const isGroupTriggered = groupAlerts.some((a) => a.is_triggered);
      const isActive = isGroupEnabled && !isGroupTriggered;

      if (isActive) {
        active++;
      } else {
        inactive++;
      }
    }

    // Count ungrouped alerts normally
    for (const alert of ungrouped) {
      if (alert.is_enabled && !alert.is_triggered) {
        active++;
      } else {
        inactive++;
      }
    }

    return { activeCount: active, inactiveCount: inactive };
  }, [alerts]);

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

      {/* Alerts list - grouped by ticker */}
      {!alertsLoading && filteredAlerts.length > 0 && (
        <div className="space-y-4">
          {groupedDisplayItems.map(([ticker, items]) => {
            const quote = quotes[ticker];
            const currentPrice = quote?.price;
            const firstItem = items[0];
            const stockName =
              firstItem?.type === 'single'
                ? firstItem.alert.stocks?.name
                : firstItem?.stocks?.name;

            return (
              <div key={ticker} className="space-y-1.5">
                {/* Group header */}
                <div className="flex items-center gap-2 px-1">
                  <span className="font-bold text-sm">{ticker}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {stockName}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-mono-price text-muted-foreground">
                    {currentPrice ? `$${currentPrice.toFixed(2)}` : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {items.length} {pluralizeAlert(items.length)}
                  </span>
                </div>

                {/* Alerts for this ticker */}
                <div className="space-y-1">
                  {items.map((item) => {
                    if (item.type === 'range') {
                      // Range alert (grouped above + below)
                      return (
                        <div
                          key={item.groupId}
                          className={`rounded-lg px-3 py-2 ${
                            item.is_triggered
                              ? 'bg-amber-500/10'
                              : item.is_enabled
                                ? 'bg-muted/30'
                                : 'bg-muted/20 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {/* Range condition */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <ArrowUpDown className="h-4 w-4 text-violet-500" />
                                <span className="font-mono-price text-sm">
                                  ${item.belowAlert.condition_value.toFixed(2)}{' '}
                                  – $
                                  {item.aboveAlert.condition_value.toFixed(2)}
                                </span>
                              </div>
                              {item.repeat_after_trigger && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <RotateCcw className="h-3 w-3" />
                                  opakující
                                </span>
                              )}
                              {item.is_triggered && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 h-[18px] text-amber-500 border-amber-500/30"
                                >
                                  <Check className="h-3 w-3 mr-0.5" />
                                  Dokončeno
                                </Badge>
                              )}
                              {!item.is_enabled && !item.is_triggered && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 h-[18px] text-muted-foreground"
                                >
                                  Vypnuto
                                </Badge>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              {item.is_triggered ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleReset(item)}
                                  disabled={resetGroupMutation.isPending}
                                  title="Reset"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <Switch
                                  checked={item.is_enabled}
                                  onCheckedChange={() => handleToggle(item)}
                                  disabled={toggleGroupMutation.isPending}
                                />
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditRangeForm(item)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setDeleteConfirm(item)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Single alert
                    const alert = item.alert;
                    return (
                      <div
                        key={alert.id}
                        className={`rounded-lg px-3 py-2 ${
                          alert.is_triggered
                            ? 'bg-amber-500/10'
                            : alert.is_enabled
                              ? 'bg-muted/30'
                              : 'bg-muted/20 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {/* Condition */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {CONDITION_ICONS[alert.condition_type]}
                              <span className="font-mono-price text-sm">
                                {formatConditionValue(
                                  alert.condition_type,
                                  alert.condition_value,
                                )}
                              </span>
                            </div>
                            {alert.repeat_after_trigger && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <RotateCcw className="h-3 w-3" />
                                opakující
                              </span>
                            )}
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

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            {alert.is_triggered ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleReset(item)}
                                disabled={resetMutation.isPending}
                                title="Reset"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Switch
                                checked={alert.is_enabled}
                                onCheckedChange={() => handleToggle(item)}
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
                              onClick={() => setDeleteConfirm(item)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

            {editingRangeAlert && (
              <div className="text-sm text-muted-foreground">
                {editingRangeAlert.stocks?.ticker} -{' '}
                {editingRangeAlert.stocks?.name}
              </div>
            )}

            {/* Condition type */}
            {editingRangeAlert ? (
              // Range edit - show as disabled toggle item
              <div className="space-y-2">
                <Label>Podmínka</Label>
                <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-full">
                  <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium flex-1 gap-1.5 bg-violet-600 text-white">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Cenové pásmo
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Podmínka</Label>
                <ToggleGroup
                  type="single"
                  value={formData.condition_type}
                  onValueChange={(v) =>
                    v &&
                    setFormData({
                      ...formData,
                      condition_type: v as FormConditionType,
                    })
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
                  {/* "Both" option only for create mode */}
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
                    <ArrowDown className="h-3.5 w-3.5 text-rose-500" />
                    Dolní hranice - pod ($)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="90.00"
                    value={formData.price_below_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price_below_value: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <ArrowUp className="h-3.5 w-3.5 text-emerald-500" />
                    Horní hranice - nad ($)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="110.00"
                    value={formData.price_above_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price_above_value: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            ) : (
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
                    setFormData({
                      ...formData,
                      condition_value: e.target.value,
                    })
                  }
                />
              </div>
            )}

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
                (formData.condition_type === 'price_both'
                  ? !formData.price_above_value || !formData.price_below_value
                  : !formData.condition_value) ||
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
        title={
          deleteConfirm?.type === 'range'
            ? 'Smazat cenové pásmo?'
            : 'Smazat alert?'
        }
        description={
          deleteConfirm?.type === 'range'
            ? `Opravdu chcete smazat cenové pásmo pro ${deleteConfirm.stocks?.ticker}?`
            : `Opravdu chcete smazat alert pro ${deleteConfirm?.type === 'single' ? deleteConfirm.alert.stocks?.ticker : ''}?`
        }
        confirmLabel="Smazat"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}
