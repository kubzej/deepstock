import {
  Home,
  Briefcase,
  Search,
  Settings,
  Plus,
  TrendingUp,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNewTransaction: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  onNewTransaction,
}: SidebarProps) {
  const { signOut, user } = useAuth();

  const menuItems = [
    { id: 'home', icon: Home, label: 'Přehled' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'research', icon: Search, label: 'Výzkum' },
    { id: 'watchlist', icon: TrendingUp, label: 'Watchlisty' },
    { id: 'settings', icon: Settings, label: 'Nastavení' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen bg-card border-r border-border fixed left-0 top-0">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-primary">DeepStock</h1>
      </div>

      {/* New Transaction Button */}
      <div className="p-4">
        <Button onClick={onNewTransaction} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Nová transakce
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
            {user?.email}
          </p>
          <button
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Odhlásit se"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">DeepStock v0.1.0</p>
      </div>
    </aside>
  );
}
