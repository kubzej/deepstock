import {
  LayoutDashboard,
  Wallet,
  Database,
  LineChart,
  Eye,
  Settings,
  Menu,
  Plus,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';

interface MobileHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNewTransaction: () => void;
}

export function MobileHeader({
  activeTab,
  onTabChange,
  onNewTransaction,
}: MobileHeaderProps) {
  const { signOut, user } = useAuth();
  const { portfolio, isAllPortfolios } = usePortfolio();

  const menuItems = [
    { id: 'home', icon: LayoutDashboard, label: 'Přehled' },
    { id: 'portfolio', icon: Wallet, label: 'Portfolia' },
    { id: 'stocks', icon: Database, label: 'Akcie' },
    { id: 'analysis', icon: LineChart, label: 'Analýza' },
    { id: 'watchlist', icon: Eye, label: 'Watchlisty' },
    { id: 'settings', icon: Settings, label: 'Nastavení' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-sm md:hidden z-50">
      <div className="flex items-center justify-between h-full px-4">
        {/* Logo + Portfolio */}
        <div className="flex flex-col">
          <span className="text-lg font-bold text-primary">DeepStock</span>
          <span className="text-xs text-muted-foreground -mt-0.5">
            {isAllPortfolios ? 'Všechna portfolia' : portfolio?.name || '—'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Add Button */}
          <Button
            onClick={onNewTransaction}
            size="sm"
            className="h-8 px-3 gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span className="sr-only sm:not-sr-only">Přidat</span>
          </Button>

          {/* Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                <Menu className="w-6 h-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={isActive ? 'bg-primary/10 text-primary' : ''}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={signOut}
                className="text-muted-foreground"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Odhlásit se
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
