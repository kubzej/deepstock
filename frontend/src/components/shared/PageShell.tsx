import type { ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DataFreshnessIndicator } from './DataFreshnessIndicator';

export type PageWidth = 'narrow' | 'default' | 'wide' | 'full';
export type PageGap = 'sm' | 'md' | 'lg';

const widthClasses: Record<PageWidth, string> = {
  narrow: 'mx-auto w-full max-w-3xl',
  default: 'mx-auto w-full max-w-4xl',
  wide: 'mx-auto w-full max-w-6xl',
  full: 'w-full',
};

const gapClasses: Record<PageGap, string> = {
  sm: 'space-y-4',
  md: 'space-y-6',
  lg: 'space-y-8',
};

interface PageShellProps {
  children: ReactNode;
  width?: PageWidth;
  gap?: PageGap;
  bleed?: boolean;
  className?: string;
}

export function PageShell({
  children,
  width = 'wide',
  gap = 'md',
  bleed = false,
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'pb-12',
        gapClasses[gap],
        widthClasses[width],
        bleed && '-mx-4 md:-mx-6 lg:-mx-8 xl:-mx-10',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PageActionBarProps {
  actions?: ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  dataUpdatedAt?: number | null;
}

function PageActionBar({
  actions,
  onRefresh,
  isRefreshing = false,
  dataUpdatedAt,
}: PageActionBarProps) {
  if (!actions && !onRefresh && dataUpdatedAt === undefined) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
      {actions}

      {dataUpdatedAt !== undefined && (
        <DataFreshnessIndicator
          dataUpdatedAt={dataUpdatedAt}
          isFetching={isRefreshing}
          className="hidden sm:inline"
        />
      )}

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
            className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
          />
        </Button>
      )}
    </div>
  );
}

interface PageIntroProps extends PageActionBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function PageIntro({
  title,
  subtitle,
  eyebrow,
  meta,
  leading,
  actions,
  onRefresh,
  isRefreshing = false,
  dataUpdatedAt,
  className,
  titleClassName,
}: PageIntroProps) {
  const hasActions = !!actions || !!onRefresh || dataUpdatedAt !== undefined;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="min-w-0 space-y-3">
        {leading}
        <div className="space-y-2">
          {eyebrow && (
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <h1
              className={cn(
                'min-w-0 flex-1 text-2xl font-bold tracking-tight',
                titleClassName,
              )}
            >
              {title}
            </h1>
            {hasActions && (
              <PageActionBar
                actions={actions}
                onRefresh={onRefresh}
                isRefreshing={isRefreshing}
                dataUpdatedAt={dataUpdatedAt}
              />
            )}
          </div>
          {subtitle && (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {meta && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}

interface PageHeroProps extends PageActionBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function PageHero({
  title,
  subtitle,
  eyebrow,
  meta,
  actions,
  onRefresh,
  isRefreshing = false,
  dataUpdatedAt,
  children,
  className,
  titleClassName,
}: PageHeroProps) {
  return (
    <section className={cn('space-y-5', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow && (
            <div className="text-sm text-muted-foreground">{eyebrow}</div>
          )}
          <div className="space-y-2.5">
            <div className={cn('tracking-tight', titleClassName)}>{title}</div>
            {subtitle && (
              <div className="text-sm text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>

        <PageActionBar
          actions={actions}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          dataUpdatedAt={dataUpdatedAt}
        />
      </div>

      {meta && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {meta}
        </div>
      )}

      {children}
    </section>
  );
}

interface PageSectionProps {
  children: ReactNode;
  className?: string;
  gap?: PageGap;
}

export function PageSection({
  children,
  className,
  gap = 'md',
}: PageSectionProps) {
  return <section className={cn(gapClasses[gap], className)}>{children}</section>;
}

interface PageBackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function PageBackButton({
  onClick,
  label = 'Zpět',
  className,
}: PageBackButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        '-ml-2 w-fit text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
