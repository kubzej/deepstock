/**
 * Price Alerts API - Custom price alerts CRUD operations
 */
import { API_URL, getAuthHeader } from './client';

// ============ Alert Types ============

export type AlertConditionType = 'price_above' | 'price_below' | 'percent_change_day';

export interface PriceAlert {
  id: string;
  user_id: string;
  stock_id: string;
  condition_type: AlertConditionType;
  condition_value: number;
  is_enabled: boolean;
  is_triggered: boolean;
  triggered_at: string | null;
  repeat_after_trigger: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  stocks: {
    ticker: string;
    name: string;
  };
}

export interface PriceAlertCreate {
  stock_id: string;
  condition_type: AlertConditionType;
  condition_value: number;
  is_enabled?: boolean;
  repeat_after_trigger?: boolean;
  notes?: string | null;
}

export interface PriceAlertUpdate {
  condition_type?: AlertConditionType;
  condition_value?: number;
  is_enabled?: boolean;
  repeat_after_trigger?: boolean;
  notes?: string | null;
}

// ============ Alert Endpoints ============

export async function fetchAlerts(): Promise<PriceAlert[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst alerty');
  }
  
  return response.json();
}

export async function fetchActiveAlerts(): Promise<PriceAlert[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/active`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst aktivní alerty');
  }
  
  return response.json();
}

export async function fetchAlert(alertId: string): Promise<PriceAlert> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/${alertId}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Alert nenalezen');
    throw new Error('Nepodařilo se načíst alert');
  }
  
  return response.json();
}

export async function createAlert(data: PriceAlertCreate): Promise<PriceAlert> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se vytvořit alert');
  }
  
  return response.json();
}

export async function updateAlert(alertId: string, data: PriceAlertUpdate): Promise<PriceAlert> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/${alertId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Alert nenalezen');
    throw new Error('Nepodařilo se upravit alert');
  }
  
  return response.json();
}

export async function deleteAlert(alertId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/${alertId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Alert nenalezen');
    throw new Error('Nepodařilo se smazat alert');
  }
}

export async function resetAlert(alertId: string): Promise<PriceAlert> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/${alertId}/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Alert nenalezen');
    throw new Error('Nepodařilo se resetovat alert');
  }
  
  return response.json();
}

export async function toggleAlert(alertId: string): Promise<PriceAlert> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/alerts/${alertId}/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Alert nenalezen');
    throw new Error('Nepodařilo se přepnout alert');
  }
  
  return response.json();
}
