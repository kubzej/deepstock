import { Moon, Sun } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  PageBackButton,
  PageIntro,
  PageShell,
} from '@/components/shared/PageShell';
import { UtilitySection } from './UtilityScreen';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeMode } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{
  value: ThemeMode;
  title: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: 'light',
    title: 'Světlý režim',
    description: 'Čistší kontrast pro denní práci a výchozí stav aplikace.',
    icon: Sun,
  },
  {
    value: 'dark',
    title: 'Tmavý režim',
    description: 'Klidnější plochy pro večer, PWA používání a delší sezení.',
    icon: Moon,
  },
];

export function AppearanceSettings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <PageShell width="full">
      <PageIntro
        title="Vzhled"
        subtitle="Zvol si režim rozhraní, který se má v DeepStocku trvale používat."
        leading={<PageBackButton onClick={() => navigate({ to: '/settings' })} />}
      />

      <UtilitySection title="Motiv aplikace">
        <RadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === 'light' || value === 'dark') {
              setTheme(value);
            }
          }}
          className="space-y-3"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;

            return (
              <Label
                key={option.value}
                htmlFor={`theme-${option.value}`}
                className={cn(
                  'flex cursor-pointer items-start gap-4 rounded-2xl border px-4 py-4 transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/8'
                    : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30',
                )}
              >
                <RadioGroupItem
                  id={`theme-${option.value}`}
                  value={option.value}
                  className="mt-1"
                />
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background ring-1 ring-border/60">
                    <Icon className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{option.title}</div>
                    <p className="text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                </div>
              </Label>
            );
          })}
        </RadioGroup>
      </UtilitySection>
    </PageShell>
  );
}
