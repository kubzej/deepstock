/**
 * Options Trading Page
 *
 * Main page for viewing and managing option positions.
 * Simple flow:
 * - BTO/STO → creates position → shows on page
 * - Edit → edit the opening transaction
 * - Close → add closing transaction (STC/BTC/EXPIRATION/ASSIGNMENT/EXERCISE)
 * - Delete → delete all transactions for this position
 */
import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useOptionHoldings,
  useOptionStats,
  useDeleteOptionTransactionsBySymbol,
} from '@/hooks/useOptions';
import { useOptionQuotes } from '@/hooks/useOptionQuotes';
import { useQuotes } from '@/hooks/useQuotes';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { OptionsTrades } from './OptionsTrades';
import { OptionsCalculator } from './OptionsCalculator';
import { OptionsGreeksGuide } from './OptionsGreeksGuide';
import {
  OptionTransactionModal,
  type ModalMode,
} from './OptionTransactionModal';
import type { OptionHolding } from '@/lib/api';

type OptionsTab = 'positions' | 'calculator' | 'greeks';

interface OptionsPageProps {
  onAddOption?: () => void;
}

export function OptionsPage({ onAddOption }: OptionsPageProps) {
  const [activeTab, setActiveTab] = useState<OptionsTab>('positions');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('open');
  const [selectedHolding, setSelectedHolding] = useState<OptionHolding | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [holdingToDelete, setHoldingToDelete] = useState<OptionHolding | null>(
    null,
  );

  const queryClient = useQueryClient();
  const { portfolio, isAllPortfolios } = usePortfolio();
  const deleteBySymbolMutation = useDeleteOptionTransactionsBySymbol();

  const portfolioId = isAllPortfolios ? undefined : portfolio?.id;

  const {
    data: holdings = [],
    isLoading,
    isFetching,
    dataUpdatedAt,
    error,
  } = useOptionHoldings(portfolioId);
  const { data: stats } = useOptionStats(portfolioId);

  // Extract option symbols for quotes
  const optionSymbols = useMemo(
    () => holdings.map((h) => h.option_symbol).filter(Boolean),
    [holdings],
  );

  // Extract underlying symbols for stock quotes
  const underlyingSymbols = useMemo(
    () => [...new Set(holdings.map((h) => h.symbol).filter(Boolean))],
    [holdings],
  );

  // Fetch live quotes for options
  const { data: optionQuotesData = {}, refetch: refetchOptionQuotes } =
    useOptionQuotes(optionSymbols);

  // Fetch live quotes for underlying stocks
  const { data: underlyingQuotes = {}, refetch: refetchUnderlyingQuotes } =
    useQuotes(underlyingSymbols);

  // Merge quotes into holdings
  const holdingsWithQuotes = useMemo(() => {
    return holdings.map((h) => {
      const optionQuote = optionQuotesData[h.option_symbol];
      const underlyingQuote = underlyingQuotes[h.symbol];

      return {
        ...h,
        // Option price data
        current_price: optionQuote?.price ?? h.current_price,
        bid: optionQuote?.bid ?? h.bid,
        ask: optionQuote?.ask ?? h.ask,
        implied_volatility:
          optionQuote?.impliedVolatility ?? h.implied_volatility,
        // Underlying price - use fresh quote
        underlying_price: underlyingQuote?.price ?? h.underlying_price,
      };
    });
  }, [holdings, optionQuotesData, underlyingQuotes]);

  const handleRefresh = () => {
    // Refetch all option data
    queryClient.refetchQueries({ queryKey: ['optionHoldings'] });
    queryClient.refetchQueries({ queryKey: ['optionStats'] });
    refetchOptionQuotes();
    refetchUnderlyingQuotes();
  };

  // Close position (add closing transaction)
  const handleClose = useCallback((holding: OptionHolding) => {
    setModalMode('close');
    setSelectedHolding(holding);
    setModalOpen(true);
  }, []);

  // Delete position (all transactions)
  const handleDelete = useCallback((holding: OptionHolding) => {
    setHoldingToDelete(holding);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = async () => {
    if (holdingToDelete && portfolioId) {
      try {
        await deleteBySymbolMutation.mutateAsync({
          portfolioId,
          optionSymbol: holdingToDelete.option_symbol,
        });
        handleRefresh();
      } catch (err) {
        console.error('Failed to delete position:', err);
      }
    }
    setDeleteDialogOpen(false);
    setHoldingToDelete(null);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Opce"
        subtitle={stats ? `${stats.total_positions} pozic` : undefined}
        onRefresh={handleRefresh}
        isRefreshing={isFetching}
        dataUpdatedAt={dataUpdatedAt}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nepodařilo se načíst opce: {error.message}
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as OptionsTab)}
      >
        <TabsList>
          <TabsTrigger value="positions">Pozice</TabsTrigger>
          <TabsTrigger value="calculator">Kalkulačka</TabsTrigger>
          <TabsTrigger value="greeks">Greeks</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <OptionsTrades
              holdings={holdingsWithQuotes}
              onClose={handleClose}
              onDelete={handleDelete}
              onAddOption={onAddOption}
            />
          )}
        </TabsContent>

        <TabsContent value="calculator" className="mt-4">
          <OptionsCalculator />
        </TabsContent>

        <TabsContent value="greeks" className="mt-4">
          <OptionsGreeksGuide />
        </TabsContent>
      </Tabs>

      {/* Transaction Modal - handles open/edit/close modes */}
      <OptionTransactionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        holding={selectedHolding}
        onSuccess={handleRefresh}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Smazat pozici"
        description={`Opravdu chcete smazat tuto pozici? Budou smazány všechny transakce.${holdingToDelete ? ` ${holdingToDelete.symbol} ${holdingToDelete.option_type.toUpperCase()} $${holdingToDelete.strike_price}` : ''}`}
        confirmLabel="Smazat"
        onConfirm={confirmDelete}
        loading={deleteBySymbolMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}
