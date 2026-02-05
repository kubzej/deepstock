import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Login } from '@/components/Login';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/Dashboard';
import { StockDetail } from '@/components/StockDetail';
import { TransactionModal } from '@/components/TransactionModal';
import { StockFormDialog } from '@/components/StockFormDialog';
import StocksManager from '@/components/StocksManager';
import { WatchlistsPage } from '@/components/WatchlistsPage';
import { SettingsPage } from '@/components/SettingsPage';
import { deleteStock } from '@/lib/api';
import type { Stock } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);

  // Stock edit/delete state
  const [editStock, setEditStock] = useState<Stock | null>(null);
  const [deleteStockData, setDeleteStockData] = useState<Stock | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

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

  // Stock edit handlers
  const handleEditStock = (stock: Stock) => {
    setEditStock(stock);
  };

  const handleEditSuccess = () => {
    // Refresh the page to show updated data
    const ticker = editStock?.ticker;
    setEditStock(null);
    if (ticker) {
      setSelectedTicker(null);
      setTimeout(() => setSelectedTicker(ticker), 100);
    }
  };

  // Stock delete handlers
  const handleDeleteStock = (stock: Stock) => {
    setDeleteStockData(stock);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteStockData) return;
    setDeleteSaving(true);
    try {
      await deleteStock(deleteStockData.id);
      setDeleteStockData(null);
      setSelectedTicker(null);
      setActiveTab('stocks');
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleteSaving(false);
    }
  };

  // If viewing stock detail
  if (selectedTicker) {
    return (
      <AppLayout activeTab={activeTab} onTabChange={handleTabChange}>
        <StockDetail
          ticker={selectedTicker}
          onBack={handleBackFromDetail}
          onEdit={handleEditStock}
          onDelete={handleDeleteStock}
        />

        {/* Edit Stock Dialog */}
        <StockFormDialog
          stock={editStock}
          open={!!editStock}
          onOpenChange={(open) => !open && setEditStock(null)}
          onSuccess={handleEditSuccess}
        />

        {/* Delete Stock Dialog */}
        <Dialog
          open={!!deleteStockData}
          onOpenChange={(open) => !open && setDeleteStockData(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Smazat {deleteStockData?.ticker}?</DialogTitle>
              <DialogDescription>
                Tato akce je nevratná. Smazáním akcie smažete i všechny
                transakce a holdings s ní spojené.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteStockData(null)}
              >
                Zrušit
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteSaving}
              >
                {deleteSaving ? 'Mažu...' : 'Smazat'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppLayout>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard onStockClick={handleStockClick} />;
      case 'stocks':
        return <StocksManager onStockClick={handleStockClick} />;
      case 'analysis':
        return (
          <div className="p-4">
            <h1 className="text-2xl font-bold">Analýza</h1>
            <p className="text-muted-foreground mt-2">Připravuje se...</p>
          </div>
        );
      case 'watchlist':
        return <WatchlistsPage onStockClick={handleStockClick} />;
      case 'settings':
      case 'menu':
        return <SettingsPage />;
      default:
        // Handle settings:section format
        if (activeTab.startsWith('settings:')) {
          const section = activeTab.split(':')[1] as
            | 'portfolios'
            | 'watchlists'
            | 'watchlist-tags';
          return <SettingsPage initialSection={section} />;
        }
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
