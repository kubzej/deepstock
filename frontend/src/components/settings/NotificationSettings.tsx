import {
  ArrowLeft,
  Bell,
  BellOff,
  Calendar,
  Loader2,
  Send,
  ShoppingCart,
  TrendingUp,
  UserRoundSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useState } from 'react';

interface NotificationSettingsProps {
  onBack: () => void;
}

export function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const {
    isSupported,
    isSubscribed,
    permissionState,
    settings,
    settingsLoading,
    subscribe,
    unsubscribe,
    toggleSetting,
    sendTest,
    isUpdating,
    isTesting,
  } = usePushNotifications();

  const [subscribing, setSubscribing] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleToggleNotifications = async () => {
    setSubscribing(true);
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        const success = await subscribe();
        if (!success && permissionState === 'denied') {
          setTestResult(
            'Notifikace jsou v prohlížeči zakázány. Povolte je v nastavení.',
          );
        }
      }
    } finally {
      setSubscribing(false);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    const result = await sendTest();
    if (result.success) {
      setTestResult(`Odesláno na ${result.devices} zařízení`);
    } else {
      setTestResult(result.message || 'Nepodařilo se odeslat');
    }
  };

  if (!isSupported) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold">Notifikace</h1>
        </div>

        <Alert>
          <BellOff className="h-4 w-4" />
          <AlertDescription>
            Váš prohlížeč nepodporuje push notifikace.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Notifikace</h1>
      </div>

      {/* Permission denied warning */}
      {permissionState === 'denied' && (
        <Alert variant="destructive">
          <BellOff className="h-4 w-4" />
          <AlertDescription>
            Notifikace jsou v prohlížeči zakázány. Povolte je v nastavení
            prohlížeče.
          </AlertDescription>
        </Alert>
      )}

      {/* Main toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <Label className="text-base font-medium">Push notifikace</Label>
              <p className="text-sm text-muted-foreground">
                Upozornění na cenové cíle
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {subscribing && <Loader2 className="h-4 w-4 animate-spin" />}
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggleNotifications}
              disabled={subscribing || permissionState === 'denied'}
            />
          </div>
        </div>

        {/* Sub-toggles - only show when subscribed */}
        {isSubscribed && (
          <div className="space-y-3 pl-4 border-l-2 border-muted ml-5">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-4 w-4 text-emerald-500" />
                <div>
                  <Label className="text-sm font-medium">Nákupní cíle</Label>
                  <p className="text-xs text-muted-foreground">
                    Upozornit při dosažení cílové ceny pro nákup
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.alert_buy_enabled}
                onCheckedChange={(v) => toggleSetting('alert_buy_enabled', v)}
                disabled={isUpdating || settingsLoading}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-4 w-4 text-rose-500" />
                <div>
                  <Label className="text-sm font-medium">Prodejní cíle</Label>
                  <p className="text-xs text-muted-foreground">
                    Upozornit při dosažení cílové ceny pro prodej
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.alert_sell_enabled}
                onCheckedChange={(v) => toggleSetting('alert_sell_enabled', v)}
                disabled={isUpdating || settingsLoading}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-blue-500" />
                <div>
                  <Label className="text-sm font-medium">Earnings</Label>
                  <p className="text-xs text-muted-foreground">
                    Upozornit ráno v den hlášení výsledků
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.alert_earnings_enabled}
                onCheckedChange={(v) =>
                  toggleSetting('alert_earnings_enabled', v)
                }
                disabled={isUpdating || settingsLoading}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <UserRoundSearch className="h-4 w-4 text-amber-500" />
                <div>
                  <Label className="text-sm font-medium">Insider obchody</Label>
                  <p className="text-xs text-muted-foreground">
                    Nákupy a prodeje insiderů u vašich akcií
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.alert_insider_enabled}
                onCheckedChange={(v) =>
                  toggleSetting('alert_insider_enabled', v)
                }
                disabled={isUpdating || settingsLoading}
              />
            </div>

            {settings.alert_insider_enabled && (
              <div className="flex items-center justify-between py-2 pl-7">
                <div>
                  <Label className="text-sm font-medium">
                    Minimální hodnota
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Jen obchody nad touto částkou
                  </p>
                </div>
                <Select
                  value={String(settings.insider_min_value)}
                  onValueChange={(v) =>
                    toggleSetting('insider_min_value', Number(v))
                  }
                  disabled={isUpdating || settingsLoading}
                >
                  <SelectTrigger className="w-[120px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50000">$50K</SelectItem>
                    <SelectItem value="100000">$100K</SelectItem>
                    <SelectItem value="500000">$500K</SelectItem>
                    <SelectItem value="1000000">$1M</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Test notification */}
            <div className="pt-4 space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={isTesting}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Odeslat testovací notifikaci
              </Button>

              {testResult && (
                <p className="text-sm text-muted-foreground">{testResult}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
