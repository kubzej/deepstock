/**
 * Push Notification API
 */
import { API_URL, getAuthHeader } from './client';

export interface NotificationSettings {
  notifications_enabled: boolean;
  alert_buy_enabled: boolean;
  alert_sell_enabled: boolean;
}

export interface VapidKey {
  publicKey: string;
}

/**
 * Get VAPID public key for subscription
 */
export async function fetchVapidKey(): Promise<VapidKey> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/push/vapid-key`, { headers });
  if (!res.ok) throw new Error('Failed to get VAPID key');
  return res.json();
}

/**
 * Register browser push subscription
 */
export async function subscribeToPush(subscription: PushSubscription): Promise<void> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON())
  });
  if (!res.ok) throw new Error('Failed to subscribe');
}

/**
 * Unregister browser push subscription
 */
export async function unsubscribeFromPush(subscription: PushSubscription): Promise<void> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/push/unsubscribe`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON())
  });
  if (!res.ok) throw new Error('Failed to unsubscribe');
}

/**
 * Get notification settings
 */
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/push/settings`, { headers });
  if (!res.ok) throw new Error('Failed to get settings');
  return res.json();
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(
  settings: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/push/settings`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

/**
 * Send test notification
 */
export async function sendTestNotification(): Promise<{ success: boolean; devices?: number; message?: string }> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/push/test`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error('Failed to send test');
  return res.json();
}

/**
 * Convert VAPID key from base64 to Uint8Array
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
