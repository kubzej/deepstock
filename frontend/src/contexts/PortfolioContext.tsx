import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_RATES,
  type Portfolio,
  type Quote,
  type ExchangeRates,
  type Holding,
  type OpenLot,
} from '@/lib/api';
import { useAuth } from './AuthContext';
import { usePortfolios, useCreatePortfolio } from '@/hooks/usePortfolios';
import { useHoldings } from '@/hooks/useHoldings';
import { useOpenLots } from '@/hooks/useOpenLots';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useQuotes } from '@/hooks/useQuotes';
import { useAllWatchlistTickers } from '@/hooks/useWatchlists';

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

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const createPortfolioMutation = useCreatePortfolio();

  // Local state for portfolio selection
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<
    string | null | undefined
  >(undefined);
  const [isAllPortfolios, setIsAllPortfolios] = useState(false);
  const [defaultCreated, setDefaultCreated] = useState(false);

  // React Query hooks
  const {
    data: portfoliosData = [],
    isLoading: portfoliosLoading,
    error: portfoliosError,
  } = usePortfolios();

  // Determine active portfolio
  const activePortfolio = useMemo(() => {
    if (isAllPortfolios) return null;
    if (selectedPortfolioId) {
      return portfoliosData.find((p) => p.id === selectedPortfolioId) || null;
    }
    // Default to first portfolio
    return portfoliosData[0] || null;
  }, [portfoliosData, selectedPortfolioId, isAllPortfolios]);

  // Fetch holdings based on selection
  const portfolioIdForQuery = isAllPortfolios
    ? null
    : (activePortfolio?.id ?? null);
  const {
    data: holdingsData = [],
    isLoading: holdingsLoading,
    error: holdingsError,
  } = useHoldings(portfolioIdForQuery);

  // Fetch open lots
  const { data: openLotsData = [], isLoading: openLotsLoading } =
    useOpenLots(portfolioIdForQuery);

  // Fetch exchange rates
  const { data: ratesData = DEFAULT_RATES } = useExchangeRates();

  // Prefetch: Get all watchlist tickers for background prefetching
  const { data: watchlistTickers = [] } = useAllWatchlistTickers();

  // Get unique tickers for quotes (holdings + watchlist for prefetch)
  const tickers = useMemo(() => {
    const holdingTickers = holdingsData.map((h) => h.ticker);
    // Combine with watchlist tickers for prefetching
    return [...new Set([...holdingTickers, ...watchlistTickers])];
  }, [holdingsData, watchlistTickers]);

  // Fetch quotes for holdings + watchlist tickers (single batch)
  const { data: quotesData = {}, isLoading: quotesLoading } =
    useQuotes(tickers);

  // Merge holdings with quotes
  const holdingsWithPrices: HoldingWithPrice[] = useMemo(() => {
    return holdingsData.map((h) => ({
      ...h,
      currentPrice: quotesData[h.ticker]?.price,
      dailyChange: quotesData[h.ticker]?.change,
      dailyChangePercent: quotesData[h.ticker]?.changePercent,
    }));
  }, [holdingsData, quotesData]);

  // Combined loading state
  const loading =
    portfoliosLoading || holdingsLoading || openLotsLoading || quotesLoading;

  // Combined error
  const error = portfoliosError?.message || holdingsError?.message || null;

  // Create default portfolio if none exists
  useEffect(() => {
    if (
      !portfoliosLoading &&
      portfoliosData.length === 0 &&
      user &&
      !defaultCreated
    ) {
      setDefaultCreated(true);
      createPortfolioMutation.mutate('Hlavní portfolio');
    }
  }, [portfoliosLoading, portfoliosData.length, user, defaultCreated]);

  const getHoldingByTicker = useCallback(
    (ticker: string): HoldingWithPrice | undefined => {
      const matchingHoldings = holdingsWithPrices.filter(
        (h) => h.ticker === ticker,
      );

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
        portfolio_id: undefined,
        portfolio_name: undefined,
      };
    },
    [holdingsWithPrices],
  );

  const setActivePortfolio = useCallback(async (portfolioId: string | null) => {
    if (portfolioId === null) {
      // "All portfolios" mode
      setIsAllPortfolios(true);
      setSelectedPortfolioId(null);
    } else {
      // Single portfolio mode
      setIsAllPortfolios(false);
      setSelectedPortfolioId(portfolioId);
    }
  }, []);

  // Force refresh function
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portfolios'] }),
      queryClient.invalidateQueries({ queryKey: ['holdings'] }),
      queryClient.invalidateQueries({ queryKey: ['openLots'] }),
      queryClient.invalidateQueries({ queryKey: ['quotes'] }),
      queryClient.invalidateQueries({ queryKey: ['exchangeRates'] }),
    ]);
  }, [queryClient]);

  const value: PortfolioContextType = {
    portfolio: activePortfolio,
    activePortfolio,
    portfolios: portfoliosData,
    holdings: holdingsWithPrices,
    openLots: openLotsData,
    quotes: quotesData,
    rates: ratesData,
    loading,
    error,
    lastFetched: null, // No longer tracked, React Query handles this
    isAllPortfolios,
    refresh,
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
