import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataFreshnessIndicator } from './DataFreshnessIndicator';

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional subtitle (e.g., portfolio name) */
  subtitle?: string;
  /** Called when refresh button is clicked */
  onRefresh?: () => void;
  /** Show loading spinner on refresh button */
  isRefreshing?: boolean;
  /** Timestamp when data was last updated (epoch ms) */
  dataUpdatedAt?: number | null;
  /** Additional actions (buttons) to show on the right */
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  onRefresh,
  isRefreshing = false,
  dataUpdatedAt,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Data freshness indicator */}
        {dataUpdatedAt !== undefined && (
          <DataFreshnessIndicator
            dataUpdatedAt={dataUpdatedAt}
            isFetching={isRefreshing}
            className="hidden sm:inline"
          />
        )}

        {/* Custom actions */}
        {actions}

        {/* Refresh button */}
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 w-8"
            title="Obnovit data"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        )}
      </div>
    </div>
  );
}
