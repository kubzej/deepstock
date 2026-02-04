import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/Dashboard';
import {
  StockDetail,
  type StockPosition,
  type OpenLot,
} from '@/components/StockDetail';

// Mock data for detail view (same as Dashboard, will be centralized later)
const MOCK_HOLDINGS: StockPosition[] = [
  {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    shares: 15,
    avgCost: 185.5,
    currency: 'USD',
    sector: 'Technology',
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft Corp.',
    shares: 10,
    avgCost: 380.0,
    currency: 'USD',
    sector: 'Technology',
  },
  {
    ticker: 'TSLA',
    name: 'Tesla Inc.',
    shares: 5,
    avgCost: 245.0,
    currency: 'USD',
    sector: 'Consumer Cyclical',
  },
  {
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    shares: 8,
    avgCost: 450.0,
    currency: 'USD',
    sector: 'Technology',
  },
  {
    ticker: 'GOOGL',
    name: 'Alphabet Inc.',
    shares: 12,
    avgCost: 140.0,
    currency: 'USD',
    sector: 'Communication Services',
  },
];

const MOCK_LOTS: OpenLot[] = [
  {
    id: '1',
    ticker: 'AAPL',
    date: '2024-03-15',
    shares: 10,
    buyPrice: 175.0,
    currency: 'USD',
  },
  {
    id: '2',
    ticker: 'AAPL',
    date: '2024-08-20',
    shares: 5,
    buyPrice: 206.5,
    currency: 'USD',
  },
  {
    id: '3',
    ticker: 'MSFT',
    date: '2024-01-10',
    shares: 10,
    buyPrice: 380.0,
    currency: 'USD',
  },
  {
    id: '4',
    ticker: 'TSLA',
    date: '2024-06-01',
    shares: 5,
    buyPrice: 245.0,
    currency: 'USD',
  },
  {
    id: '5',
    ticker: 'NVDA',
    date: '2023-11-15',
    shares: 8,
    buyPrice: 450.0,
    currency: 'USD',
  },
  {
    id: '6',
    ticker: 'GOOGL',
    date: '2024-02-28',
    shares: 12,
    buyPrice: 140.0,
    currency: 'USD',
  },
];

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const handleStockClick = (ticker: string) => {
    setSelectedTicker(ticker);
  };

  const handleBackFromDetail = () => {
    setSelectedTicker(null);
  };

  // If viewing stock detail
  if (selectedTicker) {
    const position = MOCK_HOLDINGS.find((h) => h.ticker === selectedTicker);
    if (position) {
      return (
        <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
          <StockDetail
            ticker={selectedTicker}
            position={position}
            lots={MOCK_LOTS}
            onBack={handleBackFromDetail}
          />
        </AppLayout>
      );
    }
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard onStockClick={handleStockClick} />;
      case 'portfolio':
        return (
          <div className="p-4">
            <h1 className="text-2xl font-bold">Portfolio</h1>
            <p className="text-muted-foreground mt-2">Připravuje se...</p>
          </div>
        );
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
    <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </AppLayout>
  );
}

export default App;
