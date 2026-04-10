import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Database,
  LineChart,
  Eye,
  Search,
  Menu,
  Plus,
  LogOut,
  Target,
  Banknote,
  History,
  Settings,
  BarChart3,
  Bell,
  Rss,
  BookOpen,
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
import { useModal } from '@/contexts/ModalContext';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { PortfolioSelector } from '@/components/shared/PortfolioSelector';

const menuItems = [
  { path: '/', icon: LayoutDashboard, label: 'Přehled', exact: true },
  { path: '/stocks', icon: Database, label: 'Akcie' },
  { path: '/opce', icon: Target, label: 'Opce' },
  { path: '/history', icon: History, label: 'Historie transakcí' },
  { path: '/market', icon: BarChart3, label: 'Trh' },
  { path: '/analysis', icon: LineChart, label: 'Analýza' },
  { path: '/watchlist', icon: Eye, label: 'Watchlisty' },
  { path: '/alerts', icon: Bell, label: 'Alerty' },
  { path: '/feed', icon: Rss, label: 'Feeds' },
  { path: '/research', icon: Search, label: 'Průzkum akcie' },
  { path: '/journal', icon: BookOpen, label: 'Deník' },
  { path: '/settings', icon: Settings, label: 'Nastavení' },
];

export function MobileHeader() {
  const { signOut } = useAuth();
  const { openTransactionModal, openOptionModal } = useModal();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
    return pathname === path || pathname.startsWith(path + '/');
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-card/95 backdrop-blur-sm md:hidden z-50 pt-safe">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo + Portfolio Selector */}
        <div className="flex flex-col">
          <BrandLogo size="sm" />
          <PortfolioSelector
            variant="mobile"
            onSettingsClick={() => navigate({ to: '/settings/portfolios' })}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Add Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 px-3 gap-1.5">
                <Plus className="w-4 h-4" />
                <span className="sr-only sm:not-sr-only">Přidat</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={openTransactionModal} className="py-3">
                <Banknote className="w-5 h-5 mr-3" />
                Akciová transakce
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openOptionModal} className="py-3">
                <Target className="w-5 h-5 mr-3" />
                Opční transakce
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
                const active = isActive(item.path, item.exact);

                return (
                  <DropdownMenuItem
                    key={item.path}
                    asChild
                    className={`py-3 text-base ${active ? 'bg-primary/10 text-primary' : ''}`}
                  >
                    <Link to={item.path}>
                      <Icon className="w-5 h-5 mr-3" />
                      {item.label}
                    </Link>
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
