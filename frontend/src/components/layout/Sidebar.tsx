import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
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
  Bell,
  Rss,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export function Sidebar() {
  const { signOut, user } = useAuth();
  const { openTransactionModal, openOptionModal } = useModal();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
    return pathname === path || pathname.startsWith(path + '/');
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen bg-sidebar border-r border-border fixed left-0 top-0">
      {/* Logo + Portfolio Selector */}
      <div className="p-4 border-b border-border">
        <BrandLogo className="mb-3" />
        <PortfolioSelector
          variant="desktop"
          onSettingsClick={() => navigate({ to: '/settings/portfolios' })}
        />
      </div>

      {/* New Transaction Buttons */}
      <div className="p-4 space-y-2">
        <Button onClick={openTransactionModal} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Přidat transakci
        </Button>
        <Button onClick={openOptionModal} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Přidat opci
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.exact);

            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
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
