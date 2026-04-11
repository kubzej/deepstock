import {
  Bell,
  BellOff,
  Calendar,
  Loader2,
  Send,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  PageBackButton,
  PageIntro,
  PageShell,
} from '@/components/shared/PageShell';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  UtilityList,
  UtilityListItem,
  UtilityPanel,
  UtilitySection,
} from './UtilityScreen';

interface NotificationPreferenceRowProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled: boolean;
  iconClassName?: string;
}

function NotificationPreferenceRow({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  iconClassName,
}: NotificationPreferenceRowProps) {
  return (
    <UtilityListItem className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground ring-1 ring-border/60">
          <Icon className={iconClassName ?? 'h-4 w-4'} />
        </div>
        <div>
          <Label className="text-sm font-medium">{title}</Label>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </UtilityListItem>
  );
}

export function NotificationSettings() {
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/settings' });
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
      <PageShell width="full">
        <PageIntro
          title="Notifikace"
          leading={<PageBackButton onClick={onBack} />}
        />

        <UtilitySection title="Doručování">
          <Alert>
            <BellOff className="h-4 w-4" />
            <AlertDescription>
              Váš prohlížeč nepodporuje push notifikace.
            </AlertDescription>
          </Alert>
        </UtilitySection>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <PageIntro
        title="Notifikace"
        leading={<PageBackButton onClick={onBack} />}
      />

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

      <UtilitySection title="Doručování">
        <UtilityPanel className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-background/70 px-4 py-3 ring-1 ring-border/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label className="text-base font-medium">Push notifikace</Label>
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

          {isSubscribed && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Ověření zařízení</div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Odeslat testovací notifikaci
                </Button>

                {testResult && (
                  <p className="text-sm text-muted-foreground">{testResult}</p>
                )}
              </div>
            </div>
          )}
        </UtilityPanel>
      </UtilitySection>

      {isSubscribed && (
        <UtilitySection title="Typy upozornění">
          <UtilityList>
            <NotificationPreferenceRow
              icon={ShoppingCart}
              iconClassName="h-4 w-4 text-positive"
              title="Nákupní cíle"
              checked={settings.alert_buy_enabled}
              onCheckedChange={(value) =>
                toggleSetting('alert_buy_enabled', value)
              }
              disabled={isUpdating || settingsLoading}
            />
            <NotificationPreferenceRow
              icon={TrendingUp}
              iconClassName="h-4 w-4 text-negative"
              title="Prodejní cíle"
              checked={settings.alert_sell_enabled}
              onCheckedChange={(value) =>
                toggleSetting('alert_sell_enabled', value)
              }
              disabled={isUpdating || settingsLoading}
            />
            <NotificationPreferenceRow
              icon={Calendar}
              iconClassName="h-4 w-4 text-blue-500"
              title="Earnings"
              checked={settings.alert_earnings_enabled}
              onCheckedChange={(value) =>
                toggleSetting('alert_earnings_enabled', value)
              }
              disabled={isUpdating || settingsLoading}
            />
          </UtilityList>
        </UtilitySection>
      )}
    </PageShell>
  );
}
