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
  fetchAllHoldings,
  createPortfolio,
  fetchQuotes,
  fetchExchangeRates,
  fetchOpenLots,
  fetchAllOpenLots,
  DEFAULT_RATES,
  type Portfolio,
  type Holding,
  type Quote,
  type ExchangeRates,
  type OpenLot,
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
  /** Alias for portfolio */
  activePortfolio: Portfolio | null;
  portfolios: Portfolio[];
  holdings: HoldingWithPrice[];
  openLots: OpenLot[];
  quotes: Record<string, Quote>;
  rates: ExchangeRates;

  // State
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  /** True when viewing all portfolios combined */
  isAllPortfolios: boolean;

  // Actions
  refresh: () => Promise<void>;
  /** Set active portfolio. Use null for "All portfolios" */
  setActivePortfolio: (portfolioId: string | null) => Promise<void>;
  getHoldingByTicker: (ticker: string) => HoldingWithPrice | undefined;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(
  undefined,
);

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<HoldingWithPrice[]>([]);
  const [openLots, setOpenLots] = useState<OpenLot[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [isAllPortfolios, setIsAllPortfolios] = useState(false);

  const loadPortfolio = useCallback(
    async (force = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      // Skip if data is fresh (unless force refresh)
      if (
        !force &&
        lastFetched &&
        Date.now() - lastFetched.getTime() < CACHE_DURATION
      ) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1. Get user's portfolios
        let allPortfolios = await fetchPortfolios();

        // 2. Create default portfolio if none exists
        if (allPortfolios.length === 0) {
          const newPortfolio = await createPortfolio('Hlavní portfolio');
          allPortfolios = [newPortfolio];
        }

        setPortfolios(allPortfolios);
        const activePortfolio = allPortfolios[0];
        setPortfolio(activePortfolio);

        // 3. Get holdings and open lots for the portfolio
        const [holdingsData, lotsData] = await Promise.all([
          fetchHoldings(activePortfolio.id),
          fetchOpenLots(activePortfolio.id),
        ]);

        setOpenLots(lotsData);

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
        const holdingsWithPrices: HoldingWithPrice[] = holdingsData.map(
          (h) => ({
            ...h,
            currentPrice: quotesData[h.ticker]?.price,
            dailyChange: quotesData[h.ticker]?.change,
            dailyChangePercent: quotesData[h.ticker]?.changePercent,
          }),
        );

        setHoldings(holdingsWithPrices);
        setLastFetched(new Date());
      } catch (err) {
        console.error('Failed to load portfolio:', err);
        setError(
          err instanceof Error ? err.message : 'Nepodařilo se načíst data',
        );
      } finally {
        setLoading(false);
      }
    },
    [user, lastFetched],
  );

  // Load on mount and when user changes
  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const getHoldingByTicker = useCallback(
    (ticker: string): HoldingWithPrice | undefined => {
      const matchingHoldings = holdings.filter((h) => h.ticker === ticker);

      if (matchingHoldings.length === 0) return undefined;
      if (matchingHoldings.length === 1) return matchingHoldings[0];

      // Aggregate multiple holdings (same ticker from different portfolios)
      const first = matchingHoldings[0];
      const totalShares = matchingHoldings.reduce(
        (sum, h) => sum + h.shares,
        0,
      );
      const totalInvested = matchingHoldings.reduce(
        (sum, h) => sum + h.avg_cost * h.shares,
        0,
      );

      return {
        ...first,
        shares: totalShares,
        avg_cost: totalShares > 0 ? totalInvested / totalShares : 0,
        total_invested_czk: matchingHoldings.reduce(
          (sum, h) => sum + (h.total_invested_czk || 0),
          0,
        ),
        // Keep portfolio info undefined for aggregated holdings
        portfolio_id: undefined,
        portfolio_name: undefined,
      };
    },
    [holdings],
  );

  const setActivePortfolio = useCallback(
    async (portfolioId: string | null) => {
      setLoading(true);

      try {
        if (portfolioId === null) {
          // "All portfolios" mode
          setIsAllPortfolios(true);
          setPortfolio(null);

          // Fetch holdings and open lots from all portfolios
          const [holdingsData, lotsData] = await Promise.all([
            fetchAllHoldings(),
            fetchAllOpenLots(),
          ]);

          let quotesData: Record<string, Quote> = {};
          if (holdingsData.length > 0) {
            const tickers = [...new Set(holdingsData.map((h) => h.ticker))];
            quotesData = await fetchQuotes(tickers);
          }

          setQuotes(quotesData);

          const holdingsWithPrices: HoldingWithPrice[] = holdingsData.map(
            (h) => ({
              ...h,
              currentPrice: quotesData[h.ticker]?.price,
              dailyChange: quotesData[h.ticker]?.change,
              dailyChangePercent: quotesData[h.ticker]?.changePercent,
            }),
          );

          setHoldings(holdingsWithPrices);
          setOpenLots(lotsData);
        } else {
          // Single portfolio mode
          const selected = portfolios.find((p) => p.id === portfolioId);
          if (!selected) return;

          setIsAllPortfolios(false);
          setPortfolio(selected);

          // Fetch holdings for the selected portfolio
          const [holdingsData, lotsData] = await Promise.all([
            fetchHoldings(portfolioId),
            fetchOpenLots(portfolioId),
          ]);

          setOpenLots(lotsData);

          let quotesData: Record<string, Quote> = {};
          if (holdingsData.length > 0) {
            const tickers = holdingsData.map((h) => h.ticker);
            quotesData = await fetchQuotes(tickers);
          }

          setQuotes(quotesData);

          const holdingsWithPrices: HoldingWithPrice[] = holdingsData.map(
            (h) => ({
              ...h,
              currentPrice: quotesData[h.ticker]?.price,
              dailyChange: quotesData[h.ticker]?.change,
              dailyChangePercent: quotesData[h.ticker]?.changePercent,
            }),
          );

          setHoldings(holdingsWithPrices);
        }
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

  // Force refresh function (ignores cache)
  const forceRefresh = useCallback(() => loadPortfolio(true), [loadPortfolio]);

  const value: PortfolioContextType = {
    portfolio,
    activePortfolio: portfolio,
    portfolios,
    holdings,
    openLots,
    quotes,
    rates,
    loading,
    error,
    lastFetched,
    isAllPortfolios,
    refresh: forceRefresh,
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
