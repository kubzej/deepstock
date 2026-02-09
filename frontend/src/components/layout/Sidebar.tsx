import {
  LayoutDashboard,
  Database,
  LineChart,
  Eye,
  Settings,
  Plus,
  LogOut,
  Target,
  History,
  Search,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { PortfolioSelector } from '@/components/shared/PortfolioSelector';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNewTransaction: () => void;
  onNewOptionTransaction?: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  onNewTransaction,
  onNewOptionTransaction,
}: SidebarProps) {
  const { signOut, user } = useAuth();

  const menuItems = [
    { id: 'home', icon: LayoutDashboard, label: 'Přehled' },
    { id: 'stocks', icon: Database, label: 'Akcie' },
    { id: 'opce', icon: Target, label: 'Opce' },
    { id: 'history', icon: History, label: 'Historie' },
    { id: 'market', icon: BarChart3, label: 'Trh' },
    { id: 'analysis', icon: LineChart, label: 'Analýza' },
    { id: 'watchlist', icon: Eye, label: 'Watchlisty' },
    { id: 'research', icon: Search, label: 'Průzkum akcie' },
    { id: 'settings', icon: Settings, label: 'Nastavení' },
  ];

  const handleSettingsClick = () => {
    onTabChange('settings:portfolios');
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen bg-card border-r border-border fixed left-0 top-0">
      {/* Logo + Portfolio Selector */}
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold text-primary mb-3">DeepStock</h1>
        <PortfolioSelector
          variant="desktop"
          onSettingsClick={handleSettingsClick}
        />
      </div>

      {/* New Transaction Buttons */}
      <div className="p-4 space-y-2">
        <Button onClick={onNewTransaction} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Přidat transakci
        </Button>
        <Button onClick={onNewOptionTransaction} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Přidat opci
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
      </div>
    </aside>
  );
}
