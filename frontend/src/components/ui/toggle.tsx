"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Controls system — Segmented controls
 *
 * Use segmented controls for compact single-choice selection inside forms and
 * focused workspaces. They should stay fully visible without horizontal scroll.
 */

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow,background-color,border-color] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-transparent text-muted-foreground hover:bg-background/80 hover:text-foreground data-[state=on]:border-border/70 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
        segmented:
          "border border-transparent bg-transparent text-muted-foreground hover:bg-background/80 hover:text-foreground data-[state=on]:border-border/70 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "segmented",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
