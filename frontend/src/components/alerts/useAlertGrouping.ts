import { useMemo } from 'react';
import type { PriceAlert } from '@/hooks/useAlerts';
import type { FilterView, AlertDisplayItem, RangeAlertItem } from './types';

export function useAlertGrouping(alerts: PriceAlert[], filterView: FilterView) {
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

  const groupedDisplayItems = useMemo(() => {
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

    const displayItems: AlertDisplayItem[] = [];

    for (const [groupId, groupAlerts] of groupMap) {
      const aboveAlert = groupAlerts.find((a) => a.condition_type === 'price_above');
      const belowAlert = groupAlerts.find((a) => a.condition_type === 'price_below');

      if (aboveAlert && belowAlert) {
        const rangeItem: RangeAlertItem = {
          type: 'range',
          groupId,
          aboveAlert,
          belowAlert,
          is_enabled: aboveAlert.is_enabled && belowAlert.is_enabled,
          is_triggered: aboveAlert.is_triggered || belowAlert.is_triggered,
          repeat_after_trigger: aboveAlert.repeat_after_trigger,
          notes: aboveAlert.notes,
          stocks: aboveAlert.stocks,
        };
        displayItems.push(rangeItem);
      } else {
        groupAlerts.forEach((a) => displayItems.push({ type: 'single', alert: a }));
      }
    }

    for (const alert of ungroupedAlerts) {
      displayItems.push({ type: 'single', alert });
    }

    const tickerGroups: Record<string, AlertDisplayItem[]> = {};
    for (const item of displayItems) {
      const ticker =
        item.type === 'single'
          ? item.alert.stocks?.ticker || 'N/A'
          : item.stocks?.ticker || 'N/A';
      if (!tickerGroups[ticker]) tickerGroups[ticker] = [];
      tickerGroups[ticker].push(item);
    }

    for (const ticker of Object.keys(tickerGroups)) {
      tickerGroups[ticker].sort((a, b) => {
        const aValue =
          a.type === 'single'
            ? a.alert.condition_value
            : Math.min(a.aboveAlert.condition_value, a.belowAlert.condition_value);
        const bValue =
          b.type === 'single'
            ? b.alert.condition_value
            : Math.min(b.aboveAlert.condition_value, b.belowAlert.condition_value);
        return aValue - bValue;
      });
    }

    return Object.entries(tickerGroups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAlerts]);

  const { activeCount, inactiveCount } = useMemo(() => {
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

    for (const groupAlerts of groupMap.values()) {
      const isGroupEnabled = groupAlerts.every((a) => a.is_enabled);
      const isGroupTriggered = groupAlerts.some((a) => a.is_triggered);
      if (isGroupEnabled && !isGroupTriggered) active++;
      else inactive++;
    }

    for (const alert of ungrouped) {
      if (alert.is_enabled && !alert.is_triggered) active++;
      else inactive++;
    }

    return { activeCount: active, inactiveCount: inactive };
  }, [alerts]);

  return { filteredAlerts, groupedDisplayItems, activeCount, inactiveCount };
}
