import { AlertTriangle } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DataQualityIndicatorProps {
  /** Tickers without a live price — left out of value, cost and P/L. */
  missingTickers?: string[];
  /** The portfolio snapshot failed to refresh; the figures shown are the last good ones. */
  snapshotStale?: boolean;
}

/**
 * Small warning icon shown only when the numbers on the page are incomplete.
 * Lists every current problem in its tooltip.
 */
export function DataQualityIndicator({
  missingTickers = [],
  snapshotStale = false,
}: DataQualityIndicatorProps) {
  const { ratesError } = usePortfolio();

  const issues: string[] = [];
  if (ratesError) {
    issues.push('Kurzy měn nejsou dostupné — CZK hodnoty mohou být nepřesné.');
  }
  if (snapshotStale) {
    issues.push('Souhrn portfolia se nepodařilo obnovit — hodnoty mohou být zastaralé.');
  }
  if (missingTickers.length > 0) {
    issues.push(
      `Chybí cena pro: ${missingTickers.join(', ')} — tyto pozice nejsou v hodnotě ani v P/L.`,
    );
  }

  if (issues.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex text-warning"
          role="img"
          aria-label="Data nejsou úplná"
        >
          <AlertTriangle className="h-4 w-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <ul className="space-y-1">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
