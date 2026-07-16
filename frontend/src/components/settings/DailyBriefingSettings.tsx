import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Briefcase, Newspaper, Settings, Star } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  PageBackButton,
  PageIntro,
  PageShell,
} from '@/components/shared/PageShell';
import {
  UtilityList,
  UtilityListItem,
  UtilityListSkeleton,
  UtilityPanel,
  UtilitySection,
} from './UtilityScreen';
import {
  useDailyBriefingScopeOptions,
  useDailyBriefingSettings,
  useUpdateDailyBriefingScope,
  useUpdateDailyBriefingSettings,
} from '@/hooks/useDailyBriefing';
import type {
  DailyBriefingPriority,
  DailyBriefingScopeItem,
  DailyBriefingScopeOption,
} from '@/lib/api/daily_briefing';

type DraftItem = {
  enabled: boolean;
  priority: DailyBriefingPriority;
};

function keyFor(option: DailyBriefingScopeOption) {
  return `${option.source_type}:${option.id}`;
}

function buildScopeItems(
  options: DailyBriefingScopeOption[],
  draft: Record<string, DraftItem>,
): DailyBriefingScopeItem[] {
  return options
    .map((option) => ({
      source_type: option.source_type,
      source_id: option.id,
      enabled: draft[keyFor(option)]?.enabled ?? false,
      priority: draft[keyFor(option)]?.priority ?? 'medium',
    }))
    .filter((item) => item.enabled);
}

function SourceRow({
  option,
  draft,
  onChange,
}: {
  option: DailyBriefingScopeOption;
  draft: DraftItem;
  onChange: (draft: DraftItem) => void;
}) {
  const Icon = option.source_type === 'portfolio' ? Briefcase : Star;
  return (
    <UtilityListItem className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground ring-1 ring-border/60">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <Label className="text-sm font-medium">{option.name}</Label>
          <div className="text-xs text-muted-foreground">
            {option.source_type === 'portfolio' ? 'Portfolio' : `${option.item_count} položek`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Select
          value={draft.priority}
          onValueChange={(value) =>
            onChange({ ...draft, priority: value as DailyBriefingPriority })
          }
          disabled={!draft.enabled}
        >
          <SelectTrigger className="h-9 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">Vysoká</SelectItem>
            <SelectItem value="medium">Střední</SelectItem>
            <SelectItem value="low">Nízká</SelectItem>
          </SelectContent>
        </Select>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
        />
      </div>
    </UtilityListItem>
  );
}

export function DailyBriefingSettings() {
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/settings' });
  const { data: settings, isLoading: settingsLoading } = useDailyBriefingSettings();
  const { data: scopeOptions, isLoading: scopeLoading } = useDailyBriefingScopeOptions();
  const updateSettings = useUpdateDailyBriefingSettings();
  const updateScope = useUpdateDailyBriefingScope();
  const [enabled, setEnabled] = useState(false);
  const [includeMarketContext, setIncludeMarketContext] = useState(true);
  const [draft, setDraft] = useState<Record<string, DraftItem>>({});

  const allOptions = useMemo(
    () => [...(scopeOptions?.portfolios ?? []), ...(scopeOptions?.watchlists ?? [])],
    [scopeOptions],
  );

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setIncludeMarketContext(settings.include_market_context);
    }
  }, [settings]);

  useEffect(() => {
    if (!scopeOptions) return;
    const next: Record<string, DraftItem> = {};
    for (const option of [...scopeOptions.portfolios, ...scopeOptions.watchlists]) {
      next[keyFor(option)] = { enabled: false, priority: 'medium' };
    }
    for (const item of scopeOptions.selected_items) {
      next[`${item.source_type}:${item.source_id}`] = {
        enabled: item.enabled,
        priority: item.priority,
      };
    }
    setDraft(next);
  }, [scopeOptions]);

  const updateSetting = (next: {
    enabled?: boolean;
    include_market_context?: boolean;
  }) => {
    updateSettings.mutate({
      enabled: next.enabled ?? enabled,
      include_market_context:
        next.include_market_context ?? includeMarketContext,
    });
  };

  const handleEnabledChange = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    updateSetting({ enabled: nextEnabled });
  };

  const handleMarketContextChange = (nextIncludeMarketContext: boolean) => {
    setIncludeMarketContext(nextIncludeMarketContext);
    updateSetting({ include_market_context: nextIncludeMarketContext });
  };

  const handleScopeChange = (
    option: DailyBriefingScopeOption,
    nextItem: DraftItem,
  ) => {
    const nextDraft = { ...draft, [keyFor(option)]: nextItem };
    setDraft(nextDraft);
    updateScope.mutate(buildScopeItems(allOptions, nextDraft));
  };

  return (
    <PageShell width="full">
      <PageIntro
        title="Denní briefing"
        leading={<PageBackButton onClick={onBack} />}
      />

      <UtilitySection title="Generování">
        <UtilityPanel className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Newspaper className="h-5 w-5 text-primary" />
              </div>
              <Label className="text-base font-medium">Zapnout denní briefing</Label>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={handleEnabledChange}
              disabled={settingsLoading}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background ring-1 ring-border/60">
                <Settings className="h-5 w-5 text-muted-foreground" />
              </div>
              <Label className="text-base font-medium">Zahrnout trh, makro a sektory</Label>
            </div>
            <Switch
              checked={includeMarketContext}
              onCheckedChange={handleMarketContextChange}
              disabled={settingsLoading}
            />
          </div>
        </UtilityPanel>
      </UtilitySection>

      <UtilitySection title="Portfolia">
        {scopeLoading ? (
          <UtilityListSkeleton items={3} />
        ) : (
          <UtilityList>
            {(scopeOptions?.portfolios ?? []).map((option) => (
              <SourceRow
                key={option.id}
                option={option}
                draft={draft[keyFor(option)] ?? { enabled: false, priority: 'medium' }}
                onChange={(next) => handleScopeChange(option, next)}
              />
            ))}
          </UtilityList>
        )}
      </UtilitySection>

      <UtilitySection title="Watchlisty">
        {scopeLoading ? (
          <UtilityListSkeleton items={3} />
        ) : (
          <UtilityList>
            {(scopeOptions?.watchlists ?? []).map((option) => (
              <SourceRow
                key={option.id}
                option={option}
                draft={draft[keyFor(option)] ?? { enabled: false, priority: 'medium' }}
                onChange={(next) => handleScopeChange(option, next)}
              />
            ))}
          </UtilityList>
        )}
      </UtilitySection>

    </PageShell>
  );
}
