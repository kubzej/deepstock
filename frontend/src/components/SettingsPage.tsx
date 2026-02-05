import { useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { List, Tag, ChevronRight } from 'lucide-react';
import { WatchlistSettings } from '@/components/settings/WatchlistSettings';
import { WatchlistTagSettings } from '@/components/settings/WatchlistTagSettings';

type SettingsSection = 'menu' | 'watchlists' | 'watchlist-tags';

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('menu');

  // Render section content
  if (activeSection === 'watchlists') {
    return <WatchlistSettings onBack={() => setActiveSection('menu')} />;
  }

  if (activeSection === 'watchlist-tags') {
    return <WatchlistTagSettings onBack={() => setActiveSection('menu')} />;
  }

  // Main menu
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Nastavení</h1>
        <p className="text-muted-foreground mt-1">
          Správa watchlistů, tagů a dalších nastavení
        </p>
      </div>

      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground px-2 mb-2">
          Watchlisty
        </h2>

        <button
          onClick={() => setActiveSection('watchlists')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <List className="h-5 w-5 text-blue-500" />
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
          <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Tag className="h-5 w-5 text-violet-500" />
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

      <Separator />

      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground px-2 mb-2">
          Další nastavení
        </h2>
        <p className="text-muted-foreground text-sm px-3 py-4">
          Další možnosti nastavení budou přidány později.
        </p>
      </div>
    </div>
  );
}
