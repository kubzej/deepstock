import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Filter, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type FeedbackAction = {
  label: string;
  onClick: () => void;
};

interface FeedbackStateFrameProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: FeedbackAction;
  secondaryAction?: FeedbackAction;
  className?: string;
  children?: React.ReactNode;
}

export function FeedbackStateFrame({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  children,
}: FeedbackStateFrameProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-border/70 bg-muted/20 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-5 rounded-2xl bg-background p-4 shadow-sm ring-1 ring-border/60">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
          {secondaryAction ? (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description: string;
  retryAction?: FeedbackAction;
  secondaryAction?: FeedbackAction;
  className?: string;
}

export function ErrorState({
  title = 'Něco se nepovedlo',
  description,
  retryAction,
  secondaryAction,
  className,
}: ErrorStateProps) {
  return (
    <Alert
      variant="destructive"
      className={cn('rounded-2xl border-destructive/30 bg-destructive/8', className)}
    >
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>{description}</p>
        {(retryAction || secondaryAction) ? (
          <div className="flex flex-wrap gap-2">
            {retryAction ? (
              <Button
                size="sm"
                variant="outline"
                onClick={retryAction.onClick}
                className="border-destructive/30 bg-background text-foreground hover:bg-background"
              >
                {retryAction.label}
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

interface LoadingStateProps {
  title?: string;
  description?: string;
  lines?: number;
  className?: string;
}

export function LoadingState({
  title = 'Načítám data...',
  description = 'Chvilku strpení, připravuji obsah.',
  lines = 3,
  className,
}: LoadingStateProps) {
  return (
    <div className={cn('rounded-3xl border border-border/70 bg-muted/20 p-6', className)}>
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn('h-12 w-full rounded-2xl', index === lines - 1 && 'w-4/5')}
          />
        ))}
      </div>
      <div className="sr-only">
        {title} {description}
      </div>
    </div>
  );
}

interface GenerationStateProps {
  title?: string;
  description: string;
  className?: string;
}

export function GenerationState({
  title = 'Pracuji na tom...',
  description,
  className,
}: GenerationStateProps) {
  return (
    <FeedbackStateFrame
      icon={Loader2}
      title={title}
      description={description}
      className={cn('[&_svg]:animate-spin', className)}
    />
  );
}

interface FilteredEmptyStateProps {
  title?: string;
  description: string;
  clearAction?: FeedbackAction;
  secondaryAction?: FeedbackAction;
  className?: string;
}

export function FilteredEmptyState({
  title = 'Nic neodpovídá aktuálním filtrům',
  description,
  clearAction,
  secondaryAction,
  className,
}: FilteredEmptyStateProps) {
  return (
    <FeedbackStateFrame
      icon={Filter}
      title={title}
      description={description}
      action={clearAction}
      secondaryAction={secondaryAction}
      className={className}
    />
  );
}
