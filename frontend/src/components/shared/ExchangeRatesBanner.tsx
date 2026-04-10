import { AlertTriangle } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';

export function ExchangeRatesBanner() {
  const { ratesError } = usePortfolio();

  if (!ratesError) return null;

  return (
    <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-2.5 flex items-center gap-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        Kurzy měn nejsou dostupné — CZK hodnoty mohou být nepřesné.
      </span>
    </div>
  );
}
