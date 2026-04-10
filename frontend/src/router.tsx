import { useState } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { useModal } from '@/contexts/ModalContext';
import { useAuth } from '@/contexts/AuthContext';
import { PortfolioProvider } from '@/contexts/PortfolioContext';
import { ModalContext } from '@/contexts/ModalContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Login } from '@/components/shared/Login';
import { TransactionModal } from '@/components/transactions';
import { OptionTransactionModal } from '@/components/options';
import { Dashboard } from '@/components/dashboard';
import { StocksManager, StockDetail } from '@/components/stocks';
import { TransactionHistoryPage } from '@/components/transactions';
import { WatchlistsPage } from '@/components/watchlists';
import {
  SettingsPage,
  PortfolioSettings,
  WatchlistSettings,
  WatchlistTagSettings,
} from '@/components/settings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { FeedListSettings } from '@/components/settings/FeedListSettings';
import { JournalSettings } from '@/components/settings/JournalSettings';
import { JournalChannelSettings } from '@/components/settings/JournalChannelSettings';
import { OptionsPage } from '@/components/options';
import { AnalysisPage } from '@/components/analysis';
import { ResearchPage } from '@/components/research';
import { MarketPage } from '@/components/market';
import { AlertsPage } from '@/components/alerts';
import { FeedPage } from '@/components/feed/FeedPage';
import { JournalPage } from '@/components/journal/JournalPage';
import { NotFoundPage } from '@/components/shared/NotFoundPage';

// Root component — auth gate + providers + global modals
// activeTab/onTabChange are stubs until AppLayout is updated in step 2.3
function RootComponent() {
  const { user, loading } = useAuth();
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [optionOpen, setOptionOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <PortfolioProvider>
      <ModalContext.Provider
        value={{
          openTransactionModal: () => setTransactionOpen(true),
          openOptionModal: () => setOptionOpen(true),
        }}
      >
        <AppLayout>
          <Outlet />
        </AppLayout>

        <TransactionModal
          open={transactionOpen}
          onOpenChange={setTransactionOpen}
        />
        <OptionTransactionModal
          open={optionOpen}
          onOpenChange={setOptionOpen}
        />
      </ModalContext.Provider>
    </PortfolioProvider>
  );
}

// Page wrapper components — adapt old prop-based APIs to router navigation
// onAddTransaction / onAddOption stubs will be replaced with ModalContext in step 2.2

function DashboardPage() {
  const { openTransactionModal } = useModal();
  return <Dashboard onAddTransaction={openTransactionModal} />;
}



function OptsPage() {
  const { openOptionModal } = useModal();
  return <OptionsPage onAddOption={openOptionModal} />;
}


// Route definitions

const rootRoute = createRootRoute({ component: RootComponent });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const stocksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stocks',
  component: StocksManager,
});

const stockDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stocks/$ticker',
  component: StockDetail,
});

const opceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/opce',
  component: OptsPage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: TransactionHistoryPage,
});

const marketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/market',
  component: MarketPage,
});

const analysisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analysis',
  component: AnalysisPage,
});

const watchlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/watchlist',
  component: WatchlistsPage,
});

const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/alerts',
  component: AlertsPage,
});

const feedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/feed',
  component: FeedPage,
});

const researchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research',
  component: ResearchPage,
});

const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/journal',
  component: JournalPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const settingsPortfoliosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/portfolios',
  component: PortfolioSettings,
});

const settingsWatchlistsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/watchlists',
  component: WatchlistSettings,
});

const settingsWatchlistTagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/watchlist-tags',
  component: WatchlistTagSettings,
});

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/notifications',
  component: NotificationSettings,
});

const settingsFeedListsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/feed-lists',
  component: FeedListSettings,
});

const settingsJournalSectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/journal-sections',
  component: JournalSettings,
});

const settingsJournalChannelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/journal-channels',
  component: JournalChannelSettings,
});

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: NotFoundPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  stocksRoute,
  stockDetailRoute,
  opceRoute,
  historyRoute,
  marketRoute,
  analysisRoute,
  watchlistRoute,
  alertsRoute,
  feedRoute,
  researchRoute,
  journalRoute,
  settingsRoute,
  settingsPortfoliosRoute,
  settingsWatchlistsRoute,
  settingsWatchlistTagsRoute,
  settingsNotificationsRoute,
  settingsFeedListsRoute,
  settingsJournalSectionsRoute,
  settingsJournalChannelsRoute,
  notFoundRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
