import { Link } from '@tanstack/react-router';
import { ChevronRight, Info } from 'lucide-react';
import { PageIntro, PageShell } from '@/components/shared/PageShell';
import { SETTINGS_CATALOG } from './settingsCatalog';

export function SettingsPage() {
  return (
    <PageShell width="full">
      <PageIntro title="Nastavení" />

      <div className="space-y-6">
        {SETTINGS_CATALOG.map((section) => (
          <section key={section.title} className="space-y-3">
            <div className="px-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                {section.title}
              </h2>
            </div>

            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-border/60 hover:bg-muted/35"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1 font-medium">
                      {item.title}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Verze aplikace */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span className="font-mono">{__APP_COMMIT__}</span>
          <span className="text-muted-foreground">·</span>
          <span>
            {new Date(__BUILD_DATE__).toLocaleDateString('cs-CZ', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>
    </PageShell>
  );
}
