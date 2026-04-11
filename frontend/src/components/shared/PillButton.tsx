/**
 * Controls system — Pills
 *
 * Use pills for lightweight filters, sort toggles, and view modes.
 * Prefer `Tabs` for main content sections and `ToggleGroup` for compact
 * single-choice selection inside forms or focused workspaces.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PillSize = 'xs' | 'sm' | 'md';
type PillDirection = 'asc' | 'desc';
type PillBehavior = 'wrap' | 'scroll';

interface PillButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active: boolean;
  children: ReactNode;
  count?: ReactNode;
  direction?: PillDirection;
  indicatorClassName?: string;
  indicatorPosition?: 'leading' | 'trailing';
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  size?: PillSize;
}

export function PillButton({
  active,
  children,
  count,
  direction,
  indicatorClassName,
  indicatorPosition = 'leading',
  className,
  activeClassName,
  inactiveClassName,
  size = 'md',
  type = 'button',
  ...props
}: PillButtonProps) {
  const indicator = indicatorClassName ? (
    <span
      aria-hidden="true"
      className={cn(
        'h-1.5 w-1.5 shrink-0 rounded-full',
        active ? 'bg-current' : indicatorClassName,
      )}
    />
  ) : null;

  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
        size === 'xs' && 'h-6 px-2 text-[10px]',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        active
          ? 'border-foreground bg-foreground text-background shadow-sm'
          : 'border-border bg-background text-foreground/80 hover:bg-muted/60 hover:text-foreground',
        active ? activeClassName : inactiveClassName,
        className,
      )}
      {...props}
    >
      {indicator && indicatorPosition === 'leading' ? indicator : null}
      {children}
      {typeof count !== 'undefined' ? (
        <span className={cn('font-medium', active ? 'text-background/70' : 'text-muted-foreground')}>
          {count}
        </span>
      ) : null}
      {direction ? (
        <span className={cn('text-[11px]', active ? 'text-background/70' : 'text-muted-foreground')}>
          {direction === 'desc' ? '↓' : '↑'}
        </span>
      ) : null}
      {indicator && indicatorPosition === 'trailing' ? indicator : null}
    </button>
  );
}

interface PillGroupProps {
  children: ReactNode;
  className?: string;
  behavior?: PillBehavior;
  bleed?: boolean;
}

export function PillGroup({
  children,
  className,
  behavior = 'wrap',
  bleed = false,
}: PillGroupProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2',
        behavior === 'wrap' && 'flex-wrap',
        behavior === 'scroll' &&
          'flex-nowrap overflow-x-auto whitespace-nowrap scrollbar-hide',
        behavior === 'scroll' && bleed && '-mx-4 px-4 md:mx-0 md:px-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
