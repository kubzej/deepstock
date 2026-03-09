import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { useStocks } from '@/hooks/useStocks';
import { useQuotes } from '@/hooks/useQuotes';
import {
  useAlerts,
  useCreateAlert,
  useUpdateAlert,
  useDeleteAlert,
  useDeleteBulkAlerts,
  useResetAlert,
  useToggleAlert,
  useDeleteGroup,
  useResetGroup,
  useToggleGroup,
  type PriceAlert,
} from '@/hooks/useAlerts';
import { queryKeys } from '@/lib/queryClient';
import type { AlertConditionType } from '@/lib/api';
import { Plus, Bell, Bot, Search, X, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AlertSuggestionsPanel } from './AlertSuggestionsPanel';
import { SingleAlertCard, RangeAlertCard } from './AlertCard';
import { AlertForm } from './AlertForm';
import { useAlertGrouping } from './useAlertGrouping';
import {
  type FilterView,
  type AlertFormData,
  type AlertDisplayItem,
  type RangeAlertItem,
  EMPTY_FORM,
  pluralizeAlert,
} from './types';


export function AlertsPage() {
  const queryClient = useQueryClient();

  const {
    data: alerts = [],
    isLoading: alertsLoading,
    isFetching: alertsFetching,
    dataUpdatedAt,
    error: alertsError,
  } = useAlerts();

  const { data: stocks = [] } = useStocks();

  const alertTickers = [...new Set(alerts.map((a) => a.stocks?.ticker).filter(Boolean))] as string[];
  const { data: quotes = {} } = useQuotes(alertTickers);

  const createMutation = useCreateAlert();
  const updateMutation = useUpdateAlert();
  const deleteMutation = useDeleteAlert();
  const deleteBulkMutation = useDeleteBulkAlerts();
  const resetMutation = useResetAlert();
  const toggleMutation = useToggleAlert();
  const deleteGroupMutation = useDeleteGroup();
  const resetGroupMutation = useResetGroup();
  const toggleGroupMutation = useToggleGroup();

  const [filterView, setFilterView] = useState<FilterView>('active');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSuggestionsPanelOpen, setIsSuggestionsPanelOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null);
  const [editingRangeAlert, setEditingRangeAlert] = useState<RangeAlertItem | null>(null);
  const [formData, setFormData] = useState<AlertFormData>(EMPTY_FORM);
  const [stockSearch, setStockSearch] = useState('');
  const [tickerFilter, setTickerFilter] = useState('');

  const { filteredAlerts, groupedDisplayItems, activeCount, inactiveCount } = useAlertGrouping(
    alerts,
    filterView,
  );

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
          createMutation.mutateAsync({ ...baseData, condition_type: 'price_above', condition_value: aboveValue }),
          createMutation.mutateAsync({ ...baseData, condition_type: 'price_below', condition_value: belowValue }),
        ]);
      } else {
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

  const handleDelete = async (item: AlertDisplayItem) => {
    try {
      if (item.type === 'range') {
        await deleteGroupMutation.mutateAsync(item.groupId);
      } else {
        await deleteMutation.mutateAsync(item.alert.id);
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggle = async (item: AlertDisplayItem) => {
    if (item.type === 'range') await toggleGroupMutation.mutateAsync(item.groupId);
    else await toggleMutation.mutateAsync(item.alert.id);
  };

  const handleReset = async (item: AlertDisplayItem) => {
    if (item.type === 'range') await resetGroupMutation.mutateAsync(item.groupId);
    else await resetMutation.mutateAsync(item.alert.id);
  };

  const getItemKey = (item: AlertDisplayItem) =>
    item.type === 'range' ? item.groupId : item.alert.id;

  const toggleSelectItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedKeys(new Set());
  };

  const handleBulkDelete = async () => {
    // Collect all alert IDs for selected items
    const allItems = groupedDisplayItems.flatMap(([, items]) => items);
    const idsToDelete: string[] = [];
    for (const item of allItems) {
      if (!selectedKeys.has(getItemKey(item))) continue;
      if (item.type === 'range') {
        idsToDelete.push(item.aboveAlert.id, item.belowAlert.id);
      } else {
        idsToDelete.push(item.alert.id);
      }
    }
    if (idsToDelete.length === 0) return;
    try {
      await deleteBulkMutation.mutateAsync(idsToDelete);
      exitSelectMode();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Cenové alerty"
        onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.alerts() })}
        isRefreshing={alertsFetching}
        dataUpdatedAt={dataUpdatedAt}
      />

      {alertsError && (
        <Alert variant="destructive">
          <AlertDescription>
            {alertsError instanceof Error ? alertsError.message : 'Nepodařilo se načíst alerty'}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2 md:space-y-0 md:flex md:items-center md:gap-3">
        <div className="md:order-first md:flex-1">
          <PillGroup>
            <PillButton active={filterView === 'active'} onClick={() => setFilterView('active')}>
              Aktivní ({activeCount})
            </PillButton>
            <PillButton active={filterView === 'inactive'} onClick={() => setFilterView('inactive')}>
              Neaktivní ({inactiveCount})
            </PillButton>
          </PillGroup>
        </div>
        <div className="flex items-center justify-between md:order-last md:justify-end md:gap-2">
          {!isSelectMode && (
            <>
              <Button onClick={() => setIsSuggestionsPanelOpen(true)} size="sm" variant="outline">
                <Bot className="h-4 w-4 mr-1" />
                Návrhy AI
              </Button>
              <Button onClick={() => setIsSelectMode(true)} size="sm" variant="outline">
                Vybrat
              </Button>
              <Button onClick={openCreateForm} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nový alert
              </Button>
            </>
          )}
        </div>
      </div>

      {alertsLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!alertsLoading && filteredAlerts.length === 0 && (
        <EmptyState
          icon={Bell}
          title={filterView === 'active' ? 'Žádné aktivní alerty' : 'Žádné neaktivní alerty'}
          description={
            filterView === 'active'
              ? 'Vytvořte si alert na cenu akcie'
              : 'Všechny alerty jsou aktivní'
          }
          action={
            filterView === 'active' ? { label: 'Vytvořit alert', onClick: openCreateForm } : undefined
          }
        />
      )}

      {!alertsLoading && filteredAlerts.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Filtrovat ticker..."
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            className="pl-9 pr-9"
          />
          {tickerFilter && (
            <button
              onClick={() => setTickerFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {!alertsLoading && filteredAlerts.length > 0 && (
        <div className="space-y-4">
          {groupedDisplayItems
            .filter(([ticker]) => ticker.toLowerCase().includes(tickerFilter.toLowerCase()))
            .map(([ticker, items]) => {
            const quote = quotes[ticker];
            const currentPrice = quote?.price;
            const firstItem = items[0];
            const stockName =
              firstItem?.type === 'single'
                ? firstItem.alert.stocks?.name
                : firstItem?.stocks?.name;

            return (
              <div key={ticker} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="font-bold text-sm">{ticker}</span>
                  <span className="text-xs text-muted-foreground truncate">{stockName}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-mono-price text-muted-foreground">
                    {currentPrice ? `$${currentPrice.toFixed(2)}` : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {items.length} {pluralizeAlert(items.length)}
                  </span>
                </div>

                <div className="space-y-1">
                  {items.map((item) => {
                    const key = getItemKey(item);
                    const isSelected = selectedKeys.has(key);
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-2 ${isSelectMode ? 'cursor-pointer' : ''}`}
                        onClick={isSelectMode ? () => toggleSelectItem(key) : undefined}
                      >
                        {isSelectMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSelectItem(key); }}
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-colors ${
                              isSelected
                                ? 'bg-primary border-primary'
                                : 'border-muted-foreground/40 hover:border-primary/60'
                            }`}
                            aria-label={isSelected ? 'Zrušit výběr' : 'Vybrat'}
                          >
                            {isSelected && (
                              <svg viewBox="0 0 10 8" fill="none" className="w-full p-0.5">
                                <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          {item.type === 'range' ? (
                            <RangeAlertCard
                              item={item}
                              onEditRange={isSelectMode ? () => {} : openEditRangeForm}
                              onDelete={isSelectMode ? () => {} : handleDelete}
                              onToggle={isSelectMode ? () => {} : handleToggle}
                              onReset={isSelectMode ? () => {} : handleReset}
                              resetPending={resetGroupMutation.isPending}
                              togglePending={toggleGroupMutation.isPending}
                            />
                          ) : (
                            <SingleAlertCard
                              item={item}
                              onEdit={isSelectMode ? () => {} : openEditForm}
                              onDelete={isSelectMode ? () => {} : handleDelete}
                              onToggle={isSelectMode ? () => {} : handleToggle}
                              onReset={isSelectMode ? () => {} : handleReset}
                              resetPending={resetMutation.isPending}
                              togglePending={toggleMutation.isPending}
                            />
                          )}
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

      <AlertForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        formData={formData}
        setFormData={setFormData}
        editingAlert={editingAlert}
        editingRangeAlert={editingRangeAlert}
        stocks={stocks}
        stockSearch={stockSearch}
        setStockSearch={setStockSearch}
        onSubmit={handleSubmit}
        createPending={createMutation.isPending}
        updatePending={updateMutation.isPending}
      />

      <AlertSuggestionsPanel
        open={isSuggestionsPanelOpen}
        onClose={() => setIsSuggestionsPanelOpen(false)}
        stocks={stocks}
      />

      {isSelectMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-background border rounded-xl shadow-lg px-4 py-3">
            <Button onClick={exitSelectMode} size="sm" variant="outline">
              Zrušit
            </Button>
            <span className="text-sm text-muted-foreground">
              Vybráno: {selectedKeys.size}
            </span>
            {selectedKeys.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={deleteBulkMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                {deleteBulkMutation.isPending ? 'Mazání...' : 'Smazat'}
              </Button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
