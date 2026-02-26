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
  /** True only on initial load (no data yet) - show skeleton */
  isInitialLoading: boolean;
  /** True when fetching (may have stale data) - show spinner */
  isFetching: boolean;
  /** @deprecated Use isInitialLoading instead */
  loading: boolean;
  error: string | null;
  /** Timestamp when data was last updated (oldest of all queries) */
  dataUpdatedAt: number | null;
  /** @deprecated Use dataUpdatedAt instead */
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
    isFetching: portfoliosFetching,
    dataUpdatedAt: portfoliosUpdatedAt,
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

  // Compute portfolio ID for queries - wait for portfolios to load first
  // to avoid fetching "all" first and then specific portfolio
  const portfolioIdForQuery = useMemo(() => {
    if (isAllPortfolios) return null; // Explicitly all portfolios
    if (portfoliosLoading) return undefined; // Still loading - wait
    return activePortfolio?.id ?? null;
  }, [isAllPortfolios, portfoliosLoading, activePortfolio?.id]);

  const {
    data: holdingsData = [],
    isLoading: holdingsLoading,
    isFetching: holdingsFetching,
    dataUpdatedAt: holdingsUpdatedAt,
    error: holdingsError,
  } = useHoldings(portfolioIdForQuery);

  // Fetch open lots
  const {
    data: openLotsData = [],
    isLoading: openLotsLoading,
    isFetching: openLotsFetching,
    dataUpdatedAt: openLotsUpdatedAt,
  } = useOpenLots(portfolioIdForQuery);

  // Fetch exchange rates
  const {
    data: ratesData = DEFAULT_RATES,
    isLoading: ratesLoading,
    isFetching: ratesFetching,
    dataUpdatedAt: ratesUpdatedAt,
  } = useExchangeRates();

  // Prefetch: Get all watchlist tickers for background prefetching
  const { data: watchlistTickers = [] } = useAllWatchlistTickers();

  // Get unique tickers for quotes (holdings + watchlist for prefetch)
  const tickers = useMemo(() => {
    const holdingTickers = holdingsData.map((h) => h.ticker);
    // Combine with watchlist tickers for prefetching
    return [...new Set([...holdingTickers, ...watchlistTickers])];
  }, [holdingsData, watchlistTickers]);

  // Fetch quotes for holdings + watchlist tickers (single batch)
  const {
    data: quotesData = {},
    isLoading: quotesLoading,
    isFetching: quotesFetching,
    dataUpdatedAt: quotesUpdatedAt,
  } = useQuotes(tickers);

  // Merge holdings with quotes
  const holdingsWithPrices: HoldingWithPrice[] = useMemo(() => {
    return holdingsData.map((h) => ({
      ...h,
      currentPrice: quotesData[h.ticker]?.price,
      dailyChange: quotesData[h.ticker]?.change,
      dailyChangePercent: quotesData[h.ticker]?.changePercent,
    }));
  }, [holdingsData, quotesData]);

  // Initial loading state (no data yet - show skeleton)
  const isInitialLoading =
    portfoliosLoading ||
    holdingsLoading ||
    openLotsLoading ||
    quotesLoading ||
    ratesLoading;

  // Fetching state (may have stale data - show spinner)
  const isFetching =
    portfoliosFetching ||
    holdingsFetching ||
    openLotsFetching ||
    quotesFetching ||
    ratesFetching;

  // Combined loading state (deprecated, kept for backwards compatibility)
  const loading = isInitialLoading;

  // Calculate oldest data update time (most stale data)
  const dataUpdatedAt = useMemo(() => {
    const timestamps = [
      portfoliosUpdatedAt,
      holdingsUpdatedAt,
      openLotsUpdatedAt,
      quotesUpdatedAt,
      ratesUpdatedAt,
    ].filter((t): t is number => t !== undefined && t > 0);

    if (timestamps.length === 0) return null;
    return Math.min(...timestamps);
  }, [
    portfoliosUpdatedAt,
    holdingsUpdatedAt,
    openLotsUpdatedAt,
    quotesUpdatedAt,
    ratesUpdatedAt,
  ]);

  // Combined error
  const error = portfoliosError?.message || holdingsError?.message || null;

  // Create default portfolio if none exists
  // Only create if:
  // 1. Not loading
  // 2. No error (don't create if fetch failed)
  // 3. Actually have 0 portfolios
  // 4. User is logged in
  // 5. Haven't already created one this session
  useEffect(() => {
    if (
      !portfoliosLoading &&
      !portfoliosError &&
      portfoliosData.length === 0 &&
      user &&
      !defaultCreated
    ) {
      setDefaultCreated(true);
      createPortfolioMutation.mutate('Hlavní portfolio');
    }
  }, [
    portfoliosLoading,
    portfoliosError,
    portfoliosData.length,
    user,
    defaultCreated,
  ]);

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

  const setActivePortfolio = useCallback(
    async (portfolioId: string | null) => {
      if (portfolioId === null) {
        // "All portfolios" mode
        setIsAllPortfolios(true);
        setSelectedPortfolioId(null);
      } else {
        // Single portfolio mode
        setIsAllPortfolios(false);
        setSelectedPortfolioId(portfolioId);
      }
      // Invalidate performance queries so chart refetches for new portfolio
      await queryClient.invalidateQueries({ queryKey: ['stockPerformance'] });
      await queryClient.invalidateQueries({ queryKey: ['optionsPerformance'] });
    },
    [queryClient],
  );

  // Force refresh function
  const refresh = useCallback(async () => {
    // Remove individual quote caches to force fresh batch fetch
    queryClient.removeQueries({ queryKey: ['quote'] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portfolios'] }),
      queryClient.invalidateQueries({ queryKey: ['holdings'] }),
      queryClient.invalidateQueries({ queryKey: ['openLots'] }),
      queryClient.invalidateQueries({ queryKey: ['quotes'] }),
      queryClient.invalidateQueries({ queryKey: ['exchangeRates'] }),
      queryClient.invalidateQueries({ queryKey: ['stockPerformance'] }),
      queryClient.invalidateQueries({ queryKey: ['optionsPerformance'] }),
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
    isInitialLoading,
    isFetching,
    loading,
    error,
    dataUpdatedAt,
    lastFetched: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
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
