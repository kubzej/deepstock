import { Home, Briefcase, Search, Menu, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onFabClick: () => void;
}

export function BottomNav({
  activeTab,
  onTabChange,
  onFabClick,
}: BottomNavProps) {
  const tabs = [
    { id: 'home', icon: Home, label: 'Přehled' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'fab', icon: Plus, label: 'Přidat', isFab: true },
    { id: 'research', icon: Search, label: 'Výzkum' },
    { id: 'menu', icon: Menu, label: 'Menu' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          if (tab.isFab) {
            return (
              <Button
                key={tab.id}
                onClick={onFabClick}
                className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 -mt-6 shadow-lg"
                size="icon"
              >
                <Plus className="w-6 h-6" />
              </Button>
            );
          }

          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs mt-1">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
