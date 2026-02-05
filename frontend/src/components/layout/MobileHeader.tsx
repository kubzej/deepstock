import {
  LayoutDashboard,
  Database,
  LineChart,
  Eye,
  Search,
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
import { PortfolioSelector } from '@/components/PortfolioSelector';

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
  const { signOut } = useAuth();

  const menuItems = [
    { id: 'home', icon: LayoutDashboard, label: 'Přehled' },
    { id: 'stocks', icon: Database, label: 'Akcie' },
    { id: 'analysis', icon: LineChart, label: 'Analýza' },
    { id: 'watchlist', icon: Eye, label: 'Watchlisty' },
    { id: 'research', icon: Search, label: 'Průzkum akcie' },
  ];

  const handleSettingsClick = () => {
    onTabChange('settings:portfolios');
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-sm md:hidden z-50">
      <div className="flex items-center justify-between h-full px-4">
        {/* Logo + Portfolio Selector */}
        <div className="flex flex-col">
          <span className="text-lg font-bold text-primary">DeepStock</span>
          <PortfolioSelector
            variant="mobile"
            onSettingsClick={handleSettingsClick}
          />
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
              <button className="p-2.5 text-muted-foreground hover:text-foreground transition-colors">
                <Menu className="w-7 h-7" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`py-3 text-base ${isActive ? 'bg-primary/10 text-primary' : ''}`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={signOut}
                className="py-3 text-base text-muted-foreground"
              >
                <LogOut className="w-5 h-5 mr-3" />
                Odhlásit se
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
