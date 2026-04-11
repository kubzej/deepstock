import type { MouseEventHandler, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface UtilitySectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function UtilitySection({
  title,
  description,
  actions,
  children,
  className,
}: UtilitySectionProps) {
  return (
    <section className={cn('space-y-4', className)}>
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title ? <h2 className="text-sm font-medium">{title}</h2> : null}
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

interface UtilityListProps {
  children: ReactNode;
  className?: string;
}

export function UtilityList({ children, className }: UtilityListProps) {
  return <div className={cn('space-y-2', className)}>{children}</div>;
}

interface UtilityListItemProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}

export function UtilityListItem({
  children,
  className,
  interactive = false,
}: UtilityListItemProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-muted/20 px-4 py-3',
        interactive &&
          'transition-colors hover:border-border hover:bg-muted/30',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface UtilityPanelProps {
  children: ReactNode;
  className?: string;
}

export function UtilityPanel({ children, className }: UtilityPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-muted/20 p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface UtilityEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function UtilityEmptyState(props: UtilityEmptyStateProps) {
  return <EmptyState {...props} />;
}

interface UtilityListSkeletonProps {
  items?: number;
  height?: string;
}

export function UtilityListSkeleton({
  items = 2,
  height = 'h-14',
}: UtilityListSkeletonProps) {
  return (
    <UtilityList>
      {Array.from({ length: items }).map((_, index) => (
        <Skeleton key={index} className={cn(height, 'w-full rounded-xl')} />
      ))}
    </UtilityList>
  );
}

interface UtilityActionButtonProps {
  children: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
  destructive?: boolean;
  className?: string;
}

export function UtilityActionButton({
  children,
  onClick,
  destructive = false,
  className,
}: UtilityActionButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        destructive && 'text-destructive hover:text-destructive',
        className,
      )}
    >
      {children}
    </Button>
  );
}
