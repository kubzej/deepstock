import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Login } from '@/components/Login';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/Dashboard';
import { StockDetail } from '@/components/StockDetail';
import { PortfolioManager } from '@/components/PortfolioManager';
import { TransactionModal } from '@/components/TransactionModal';
import StocksManager from '@/components/StocksManager';

function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  // Not logged in - show login
  if (!user) {
    return <Login />;
  }

  const handleStockClick = (ticker: string) => {
    setSelectedTicker(ticker);
  };

  const handleBackFromDetail = () => {
    setSelectedTicker(null);
  };

  const handleTabChange = (tab: string) => {
    // Special case: "add" opens transaction modal
    if (tab === 'add') {
      setTransactionModalOpen(true);
      return;
    }
    setActiveTab(tab);
    setSelectedTicker(null); // Reset stock detail when navigating via menu
  };

  // If viewing stock detail
  if (selectedTicker) {
    return (
      <AppLayout activeTab={activeTab} onTabChange={handleTabChange}>
        <StockDetail ticker={selectedTicker} onBack={handleBackFromDetail} />
      </AppLayout>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard onStockClick={handleStockClick} />;
      case 'portfolio':
        return <PortfolioManager />;
      case 'stocks':
        return <StocksManager onStockClick={handleStockClick} />;
      case 'research':
        return (
          <div className="p-4">
            <h1 className="text-2xl font-bold">Výzkum</h1>
            <p className="text-muted-foreground mt-2">Připravuje se...</p>
          </div>
        );
      case 'watchlist':
        return (
          <div className="p-4">
            <h1 className="text-2xl font-bold">Watchlisty</h1>
            <p className="text-muted-foreground mt-2">Připravuje se...</p>
          </div>
        );
      case 'settings':
      case 'menu':
        return (
          <div className="p-4">
            <h1 className="text-2xl font-bold">Nastavení</h1>
            <p className="text-muted-foreground mt-2">Připravuje se...</p>
          </div>
        );
      default:
        return <Dashboard onStockClick={handleStockClick} />;
    }
  };

  return (
    <AppLayout activeTab={activeTab} onTabChange={handleTabChange}>
      {renderContent()}

      {/* Transaction Modal */}
      <TransactionModal
        open={transactionModalOpen}
        onOpenChange={setTransactionModalOpen}
      />
    </AppLayout>
  );
}

export default App;
