import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePortfolio } from '@/contexts/PortfolioContext';

export function ExchangeRatesBanner() {
  const { ratesError } = usePortfolio();

  if (!ratesError) return null;

  return (
    <Alert
      variant="destructive"
      className="rounded-none border-0 bg-destructive/8 px-4 py-2.5 text-sm shadow-none"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <AlertDescription>
        Kurzy měn nejsou dostupné — CZK hodnoty mohou být nepřesné.
      </AlertDescription>
    </Alert>
  );
}
