import { useState } from 'react';
import { List, Tag, ChevronRight, Briefcase } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { WatchlistSettings } from '@/components/settings/WatchlistSettings';
import { WatchlistTagSettings } from '@/components/settings/WatchlistTagSettings';
import { PortfolioSettings } from '@/components/settings/PortfolioSettings';

type SettingsSection = 'menu' | 'portfolios' | 'watchlists' | 'watchlist-tags';

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
    </div>
  );
}
