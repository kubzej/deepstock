import { useEffect, useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HoldingsTable, type Holding } from '@/components/HoldingsTable';
import { OpenLotsRanking, type OpenLot } from '@/components/OpenLotsRanking';
import {
  fetchQuotes,
  fetchExchangeRates,
  DEFAULT_RATES,
  type Quote,
  type ExchangeRates,
} from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/format';
import { toCZK } from '@/lib/format';

// Mock portfolio data (later from Supabase)
const MOCK_HOLDINGS: Holding[] = [
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

// Mock open lots (individual purchases)
const MOCK_LOTS: OpenLot[] = [
  {
    id: '1',
    ticker: 'AAPL',
    stockName: 'Apple Inc.',
    date: '2024-03-15',
    shares: 10,
    buyPrice: 175.0,
    currentPrice: 0,
    currency: 'USD',
  },
  {
    id: '2',
    ticker: 'AAPL',
    stockName: 'Apple Inc.',
    date: '2024-08-20',
    shares: 5,
    buyPrice: 206.5,
    currentPrice: 0,
    currency: 'USD',
  },
  {
    id: '3',
    ticker: 'MSFT',
    stockName: 'Microsoft Corp.',
    date: '2024-01-10',
    shares: 10,
    buyPrice: 380.0,
    currentPrice: 0,
    currency: 'USD',
  },
  {
    id: '4',
    ticker: 'TSLA',
    stockName: 'Tesla Inc.',
    date: '2024-06-01',
    shares: 5,
    buyPrice: 245.0,
    currentPrice: 0,
    currency: 'USD',
  },
  {
    id: '5',
    ticker: 'NVDA',
    stockName: 'NVIDIA Corp.',
    date: '2023-11-15',
    shares: 8,
    buyPrice: 450.0,
    currentPrice: 0,
    currency: 'USD',
  },
  {
    id: '6',
    ticker: 'GOOGL',
    stockName: 'Alphabet Inc.',
    date: '2024-02-28',
    shares: 12,
    buyPrice: 140.0,
    currentPrice: 0,
    currency: 'USD',
  },
];

interface DashboardProps {
  onStockClick?: (ticker: string) => void;
}

export function Dashboard({ onStockClick }: DashboardProps) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const tickers = MOCK_HOLDINGS.map((h) => h.ticker);
        const [quotesData, ratesData] = await Promise.all([
          fetchQuotes(tickers),
          fetchExchangeRates(),
        ]);
        setQuotes(quotesData);
        setRates(ratesData);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Calculate totals in CZK
  const totalValueCzk = MOCK_HOLDINGS.reduce((sum, h) => {
    const price = quotes[h.ticker]?.price ?? 0;
    return sum + toCZK(price * h.shares, h.currency, rates);
  }, 0);

  const totalCostCzk = MOCK_HOLDINGS.reduce((sum, h) => {
    return sum + toCZK(h.avgCost * h.shares, h.currency, rates);
  }, 0);

  const totalPnLCzk = totalValueCzk - totalCostCzk;
  const totalPnLPercent =
    totalCostCzk > 0 ? (totalPnLCzk / totalCostCzk) * 100 : 0;

  const dailyChangeCzk = MOCK_HOLDINGS.reduce((sum, h) => {
    const change = quotes[h.ticker]?.change ?? 0;
    return sum + toCZK(change * h.shares, h.currency, rates);
  }, 0);

  const dailyChangePercent =
    totalValueCzk > 0
      ? (dailyChangeCzk / (totalValueCzk - dailyChangeCzk)) * 100
      : 0;

  // Open lots with current prices
  const lotsWithPrices = useMemo(() => {
    return MOCK_LOTS.map((lot) => ({
      ...lot,
      currentPrice: quotes[lot.ticker]?.price ?? lot.buyPrice,
    }));
  }, [quotes]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-8">
        <p className="text-muted-foreground text-sm mb-1">Portfolio</p>

        {/* Main Value */}
        <h1 className="text-4xl md:text-5xl font-bold font-mono-price mb-4">
          {formatCurrency(totalValueCzk)}
        </h1>

        {/* Stats row below */}
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {/* Daily Change */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
              Dnes
            </span>
            <span
              className={`text-lg font-mono-price font-semibold ${
                dailyChangeCzk >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {formatCurrency(dailyChangeCzk)}
            </span>
            <span
              className={`text-sm font-mono-price ml-1.5 ${
                dailyChangeCzk >= 0 ? 'text-positive/70' : 'text-negative/70'
              }`}
            >
              {formatPercent(dailyChangePercent, 1, true)}
            </span>
          </div>

          {/* Total P/L */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
              Celkem P/L
            </span>
            <span
              className={`text-lg font-mono-price font-semibold ${
                totalPnLCzk >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {formatCurrency(totalPnLCzk)}
            </span>
            <span
              className={`text-sm font-mono-price ml-1.5 ${
                totalPnLCzk >= 0 ? 'text-positive/70' : 'text-negative/70'
              }`}
            >
              {formatPercent(totalPnLPercent, 1, true)}
            </span>
          </div>

          {/* Invested */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
              Investováno
            </span>
            <span className="text-lg font-mono-price font-semibold">
              {formatCurrency(totalCostCzk)}
            </span>
          </div>

          {/* Positions */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
              Pozice
            </span>
            <span className="text-lg font-mono-price font-semibold">
              {MOCK_HOLDINGS.length}
            </span>
          </div>
        </div>
      </div>

      {/* Content with Tabs */}
      {loading ? (
        <p className="text-muted-foreground">Načítání...</p>
      ) : (
        <Tabs defaultValue="holdings" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="holdings">Držené pozice</TabsTrigger>
            <TabsTrigger value="lots">Otevřené loty</TabsTrigger>
          </TabsList>

          <TabsContent value="holdings">
            <HoldingsTable
              holdings={MOCK_HOLDINGS}
              quotes={quotes}
              rates={rates}
              onRowClick={onStockClick}
            />
          </TabsContent>

          <TabsContent value="lots">
            <OpenLotsRanking
              lots={lotsWithPrices}
              rates={rates}
              maxItems={10}
              onLotClick={(ticker) => console.log('Lot clicked:', ticker)}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
