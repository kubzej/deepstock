import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchVapidKey,
  subscribeToPush,
  unsubscribeFromPush,
  fetchNotificationSettings,
  updateNotificationSettings,
  sendTestNotification,
  urlBase64ToUint8Array,
  type NotificationPreferences
} from '@/lib/api/push';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook for managing push notifications
 */
export function usePushNotifications() {
  const queryClient = useQueryClient();
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');

  // Check browser support
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  // Get current subscription from service worker
  useEffect(() => {
    async function checkSubscription() {
      if (!isSupported) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setSubscription(sub);
      } catch (e) {
        console.error('Failed to check subscription:', e);
      }
    }
    checkSubscription();
  }, [isSupported]);

  // Fetch VAPID key
  const { data: vapidData } = useQuery({
    queryKey: ['vapid-key'],
    queryFn: fetchVapidKey,
    staleTime: Infinity, // Never changes
    enabled: isSupported
  });

  // Fetch notification settings
  const { 
    data: settings, 
    isLoading: settingsLoading 
  } = useQuery({
    queryKey: queryKeys.notificationSettings(),
    queryFn: fetchNotificationSettings,
    staleTime: 5 * 60 * 1000
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.notificationSettings(), data);
    }
  });

  // Test notification mutation
  const testMutation = useMutation({
    mutationFn: sendTestNotification
  });

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !vapidData?.publicKey) return false;

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      
      if (permission !== 'granted') {
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;
      
      // Subscribe to push
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey) as BufferSource
      });

      // Register with backend
      await subscribeToPush(sub);
      setSubscription(sub);

      // The server switches the account's notifications on with its first device
      await queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings() });

      return true;
    } catch (e) {
      console.error('Subscribe failed:', e);
      return false;
    }
  }, [isSupported, vapidData, queryClient]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return false;

    try {
      // Unregister from backend
      await unsubscribeFromPush(subscription);
      
      // Unsubscribe from browser
      await subscription.unsubscribe();
      setSubscription(null);

      // Only this device is removed; the server turns notifications off once no device is left
      await queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings() });

      return true;
    } catch (e) {
      console.error('Unsubscribe failed:', e);
      return false;
    }
  }, [subscription, queryClient]);

  // Toggle a specific setting
  const toggleSetting = useCallback(async (
    key: keyof NotificationPreferences,
    value: boolean | number
  ) => {
    await updateSettingsMutation.mutateAsync({ [key]: value });
  }, [updateSettingsMutation]);

  // Send test notification
  const sendTest = useCallback(async () => {
    return testMutation.mutateAsync();
  }, [testMutation]);

  return {
    // State
    isSupported,
    isSubscribed: !!subscription,
    permissionState,
    settings: settings ?? {
      notifications_enabled: false,
      alert_buy_enabled: true,
      alert_sell_enabled: true,
      alert_earnings_enabled: true,
      alert_daily_news_enabled: true,
    },
    settingsLoading,
    
    // Actions
    subscribe,
    unsubscribe,
    toggleSetting,
    sendTest,
    
    // Loading states
    isSubscribing: false,
    isUpdating: updateSettingsMutation.isPending,
    isTesting: testMutation.isPending
  };
}
