import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  fetchPortfolios,
  fetchHoldings,
  createPortfolio,
  fetchQuotes,
  fetchExchangeRates,
  DEFAULT_RATES,
  type Portfolio,
  type Holding,
  type Quote,
  type ExchangeRates,
} from '@/lib/api';
import { useAuth } from './AuthContext';

// Extended holding with current price data
export interface HoldingWithPrice extends Holding {
  currentPrice?: number;
  dailyChange?: number;
  dailyChangePercent?: number;
}

interface PortfolioContextType {
  // Data
  portfolio: Portfolio | null;
  portfolios: Portfolio[];
  holdings: HoldingWithPrice[];
  quotes: Record<string, Quote>;
  rates: ExchangeRates;

  // State
  loading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  setActivePortfolio: (portfolioId: string) => Promise<void>;
  getHoldingByTicker: (ticker: string) => HoldingWithPrice | undefined;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(
  undefined,
);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<HoldingWithPrice[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPortfolio = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Get user's portfolios
      let allPortfolios = await fetchPortfolios();

      // 2. Create default portfolio if none exists
      if (allPortfolios.length === 0) {
        const newPortfolio = await createPortfolio('Hlavní portfolio', 'CZK');
        allPortfolios = [newPortfolio];
      }

      setPortfolios(allPortfolios);
      const activePortfolio = allPortfolios[0];
      setPortfolio(activePortfolio);

      // 3. Get holdings for the portfolio
      const holdingsData = await fetchHoldings(activePortfolio.id);

      // 4. Fetch quotes for all tickers
      let quotesData: Record<string, Quote> = {};
      let ratesData = DEFAULT_RATES;

      if (holdingsData.length > 0) {
        const tickers = holdingsData.map((h) => h.ticker);
        [quotesData, ratesData] = await Promise.all([
          fetchQuotes(tickers),
          fetchExchangeRates(),
        ]);
      } else {
        ratesData = await fetchExchangeRates();
      }

      setQuotes(quotesData);
      setRates(ratesData);

      // 5. Merge holdings with quote data
      const holdingsWithPrices: HoldingWithPrice[] = holdingsData.map((h) => ({
        ...h,
        currentPrice: quotesData[h.ticker]?.price,
        dailyChange: quotesData[h.ticker]?.change,
        dailyChangePercent: quotesData[h.ticker]?.changePercent,
      }));

      setHoldings(holdingsWithPrices);
    } catch (err) {
      console.error('Failed to load portfolio:', err);
      setError(
        err instanceof Error ? err.message : 'Nepodařilo se načíst data',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load on mount and when user changes
  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const getHoldingByTicker = useCallback(
    (ticker: string) => holdings.find((h) => h.ticker === ticker),
    [holdings],
  );

  const setActivePortfolio = useCallback(
    async (portfolioId: string) => {
      const selected = portfolios.find((p) => p.id === portfolioId);
      if (!selected) return;

      setPortfolio(selected);
      setLoading(true);

      try {
        // Fetch holdings for the selected portfolio
        const holdingsData = await fetchHoldings(portfolioId);

        let quotesData: Record<string, Quote> = {};
        if (holdingsData.length > 0) {
          const tickers = holdingsData.map((h) => h.ticker);
          quotesData = await fetchQuotes(tickers);
        }

        setQuotes(quotesData);

        const holdingsWithPrices: HoldingWithPrice[] = holdingsData.map((h) => ({
          ...h,
          currentPrice: quotesData[h.ticker]?.price,
          dailyChange: quotesData[h.ticker]?.change,
          dailyChangePercent: quotesData[h.ticker]?.changePercent,
        }));

        setHoldings(holdingsWithPrices);
      } catch (err) {
        console.error('Failed to load portfolio:', err);
        setError(
          err instanceof Error ? err.message : 'Nepodařilo se načíst data',
        );
      } finally {
        setLoading(false);
      }
    },
    [portfolios],
  );

  const value: PortfolioContextType = {
    portfolio,
    portfolios,
    holdings,
    quotes,
    rates,
    loading,
    error,
    refresh: loadPortfolio,
    setActivePortfolio,
    getHoldingByTicker,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (context === undefined) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}
