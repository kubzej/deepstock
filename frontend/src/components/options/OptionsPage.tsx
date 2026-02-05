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
} from '@/lib/optionsHooks';
import { useOptionQuotes } from '@/hooks/useOptionQuotes';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { OptionsTrades } from './OptionsTrades';
import {
  OptionTransactionModal,
  type ModalMode,
} from './OptionTransactionModal';
import type { OptionHolding } from '@/lib/api';

type OptionsTab = 'positions' | 'calculator' | 'greeks';

export function OptionsPage() {
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
    error,
  } = useOptionHoldings(portfolioId);
  const { data: stats } = useOptionStats(portfolioId);

  // Extract option symbols for quotes
  const optionSymbols = useMemo(
    () => holdings.map((h) => h.option_symbol).filter(Boolean),
    [holdings],
  );

  // Fetch live quotes for options
  const { data: quotes = {} } = useOptionQuotes(optionSymbols);

  // Merge quotes into holdings
  const holdingsWithQuotes = useMemo(() => {
    return holdings.map((h) => {
      const quote = quotes[h.option_symbol];
      if (quote && quote.price !== null) {
        return {
          ...h,
          current_price: quote.price,
          bid: quote.bid,
          ask: quote.ask,
          implied_volatility: quote.impliedVolatility,
        };
      }
      return h;
    });
  }, [holdings, quotes]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['optionHoldings'] });
    queryClient.invalidateQueries({ queryKey: ['optionTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['optionStats'] });
    queryClient.invalidateQueries({ queryKey: ['optionQuotes'] });
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
        isRefreshing={isLoading}
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
            />
          )}
        </TabsContent>

        <TabsContent value="calculator" className="mt-4">
          <div className="text-center text-muted-foreground py-12">
            Kalkulačka - připravuje se...
          </div>
        </TabsContent>

        <TabsContent value="greeks" className="mt-4">
          <div className="text-center text-muted-foreground py-12">
            Greeks průvodce - připravuje se...
          </div>
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
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat pozici</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat tuto pozici? Budou smazány všechny
              transakce.
              {holdingToDelete && (
                <span className="block mt-2 font-mono">
                  {holdingToDelete.symbol}{' '}
                  {holdingToDelete.option_type.toUpperCase()} $
                  {holdingToDelete.strike_price}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteBySymbolMutation.isPending}
            >
              {deleteBySymbolMutation.isPending ? 'Mažu...' : 'Smazat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
