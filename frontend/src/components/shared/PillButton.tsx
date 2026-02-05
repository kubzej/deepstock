/**
 * PillButton - Unified pill-style toggle button
 * Used in: DateRangeFilter, PriceChart, WatchlistsPage sort
 *
 * Style matches shadcn Button default/outline variants
 */
import { cn } from '@/lib/utils';

interface PillButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export function PillButton({
  active,
  onClick,
  children,
  className,
  size = 'md',
}: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        size === 'sm' && 'h-7 px-3 text-xs',
        size === 'md' && 'h-8 px-4 text-sm',
        active
          ? 'bg-primary text-primary-foreground shadow hover:bg-primary/90'
          : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

interface PillGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function PillGroup({ children, className }: PillGroupProps) {
  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>{children}</div>
  );
}
