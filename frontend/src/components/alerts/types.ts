import type { PriceAlert } from '@/hooks/useAlerts';
import type { AlertConditionType } from '@/lib/api';

export type FilterView = 'active' | 'inactive';
export type FormConditionType = AlertConditionType | 'price_both';

export interface AlertFormData {
  stock_id: string;
  condition_type: FormConditionType;
  condition_value: string;
  price_above_value: string;
  price_below_value: string;
  is_enabled: boolean;
  repeat_after_trigger: boolean;
  notes: string;
}

export const EMPTY_FORM: AlertFormData = {
  stock_id: '',
  condition_type: 'price_above',
  condition_value: '',
  price_above_value: '',
  price_below_value: '',
  is_enabled: true,
  repeat_after_trigger: false,
  notes: '',
};

export interface SingleAlertItem {
  type: 'single';
  alert: PriceAlert;
}

export interface RangeAlertItem {
  type: 'range';
  groupId: string;
  aboveAlert: PriceAlert;
  belowAlert: PriceAlert;
  is_enabled: boolean;
  is_triggered: boolean;
  repeat_after_trigger: boolean;
  notes: string | null;
  stocks: { ticker: string; name: string };
}

export type AlertDisplayItem = SingleAlertItem | RangeAlertItem;

export function formatConditionValue(conditionType: AlertConditionType, value: number): string {
  if (conditionType === 'percent_change_day') return `±${Math.abs(value).toFixed(1)}%`;
  return `$${value.toFixed(2)}`;
}

export function pluralizeAlert(count: number): string {
  if (count === 1) return 'alert';
  if (count >= 2 && count <= 4) return 'alerty';
  return 'alertů';
}
