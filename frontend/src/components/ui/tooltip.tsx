'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

/**
 * Tooltip with click/tap support for mobile.
 * On desktop: hover works as usual (via onOpenChange).
 * On mobile: tap toggles open/close (via context + onClick).
 */
const TooltipContext = React.createContext<{
  open: boolean;
  toggle: () => void;
}>({ open: false, toggle: () => {} });

function Tooltip({
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [open, setOpen] = React.useState(false);

  const toggle = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  return (
    <TooltipProvider>
      <TooltipContext.Provider value={{ open: props.open ?? open, toggle }}>
        <TooltipPrimitive.Root
          data-slot="tooltip"
          open={props.open ?? open}
          onOpenChange={(value) => {
            setOpen(value);
            props.onOpenChange?.(value);
          }}
          {...props}
        >
          {children}
        </TooltipPrimitive.Root>
      </TooltipContext.Provider>
    </TooltipProvider>
  );
}

function TooltipTrigger({
  onClick,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger> & {
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const { toggle } = React.useContext(TooltipContext);

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onClick={(e) => {
        e.preventDefault();
        toggle();
        onClick?.(e);
      }}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  collisionPadding = 16,
  avoidCollisions = true,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions={avoidCollisions}
        className={cn(
          'bg-popover text-popover-foreground border border-border shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit max-w-[calc(100vw-32px)] origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-2 text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
