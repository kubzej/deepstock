import { useState } from 'react';
import { List, Tag, ChevronRight, Briefcase, Bell, Info, Rss, BookOpen, Layers } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { WatchlistSettings } from '@/components/settings/WatchlistSettings';
import { WatchlistTagSettings } from '@/components/settings/WatchlistTagSettings';
import { PortfolioSettings } from '@/components/settings/PortfolioSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { FeedListSettings } from '@/components/settings/FeedListSettings';
import { JournalSettings } from '@/components/settings/JournalSettings';
import { JournalChannelSettings } from '@/components/settings/JournalChannelSettings';

type SettingsSection =
  | 'menu'
  | 'portfolios'
  | 'watchlists'
  | 'watchlist-tags'
  | 'notifications'
  | 'feed-lists'
  | 'journal-sections'
  | 'journal-channels';

interface SettingsPageProps {
  initialSection?: SettingsSection;
}

export function SettingsPage({ initialSection = 'menu' }: SettingsPageProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>(initialSection);

  // Render section content
  if (activeSection === 'portfolios') {
    return <PortfolioSettings onBack={() => setActiveSection('menu')} />;
  }

  if (activeSection === 'watchlists') {
    return <WatchlistSettings onBack={() => setActiveSection('menu')} />;
  }

  if (activeSection === 'watchlist-tags') {
    return <WatchlistTagSettings onBack={() => setActiveSection('menu')} />;
  }

  if (activeSection === 'notifications') {
    return <NotificationSettings onBack={() => setActiveSection('menu')} />;
  }

  if (activeSection === 'feed-lists') {
    return <FeedListSettings onBack={() => setActiveSection('menu')} />;
  }

  if (activeSection === 'journal-sections') {
    return <JournalSettings onBack={() => setActiveSection('menu')} />;
  }

  if (activeSection === 'journal-channels') {
    return <JournalChannelSettings onBack={() => setActiveSection('menu')} />;
  }

  // Main menu
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Nastavení"
        subtitle="Správa portfolií, watchlistů a dalších nastavení"
      />

      {/* Portfolia section */}
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground px-2 mb-2">
          Portfolia
        </h2>

        <button
          onClick={() => setActiveSection('portfolios')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Portfolia</div>
            <div className="text-sm text-muted-foreground">
              Vytvářejte a spravujte investiční portfolia
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Watchlisty section */}
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground px-2 mb-2">
          Watchlisty
        </h2>

        <button
          onClick={() => setActiveSection('watchlists')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <List className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Watchlisty</div>
            <div className="text-sm text-muted-foreground">
              Vytvářejte a spravujte watchlisty
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        <button
          onClick={() => setActiveSection('watchlist-tags')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Tag className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Watchlist tagy</div>
            <div className="text-sm text-muted-foreground">
              Tagy pro označování položek ve watchlistech
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Notifikace section */}
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground px-2 mb-2">
          Notifikace
        </h2>

        <button
          onClick={() => setActiveSection('notifications')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Notifikace</div>
            <div className="text-sm text-muted-foreground">
              Push notifikace a cenové alerty
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Feed */}
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground px-2 mb-2">Feed</h2>
        <button
          onClick={() => setActiveSection('feed-lists')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Rss className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">X.com Feed listy</div>
            <div className="text-sm text-muted-foreground">Seznamy X účtů pro AI přehled příspěvků</div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Deník */}
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground px-2 mb-2">Deník</h2>

        <button
          onClick={() => setActiveSection('journal-sections')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Layers className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Vlastní sekce</div>
            <div className="text-sm text-muted-foreground">
              Sekce pro organizaci vlastních kanálů
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        <button
          onClick={() => setActiveSection('journal-channels')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Vlastní kanály</div>
            <div className="text-sm text-muted-foreground">
              Kanály pro osobní poznámky a zápisky
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Verze aplikace */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span className="font-mono">{__APP_COMMIT__}</span>
          <span className="text-zinc-600">·</span>
          <span>
            {new Date(__BUILD_DATE__).toLocaleDateString('cs-CZ', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
