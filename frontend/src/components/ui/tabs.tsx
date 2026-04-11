import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Controls system — Tabs
 *
 * Use tabs for switching main content sections.
 * They should keep the whole set visible on mobile by default instead of
 * hiding important sections in horizontal scrolling strips.
 */

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list text-muted-foreground inline-flex items-center justify-start gap-1 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "grid w-full grid-cols-2 rounded-2xl border border-border/60 bg-muted/50 p-1 data-[mobile-columns=3]:grid-cols-3 sm:inline-flex sm:w-fit sm:flex-nowrap [&>[data-slot=tabs-trigger]:last-child:nth-child(odd)]:col-span-2 data-[mobile-columns=3]:[&>[data-slot=tabs-trigger]:last-child:nth-child(odd)]:col-span-1",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const itemCount = React.Children.toArray(children).filter(Boolean).length
  const mobileColumns = itemCount === 3 ? 3 : 2

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      data-mobile-columns={mobileColumns}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring relative inline-flex min-h-9 min-w-0 flex-[1_1_calc(50%-0.25rem)] items-center justify-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap transition-all sm:flex-none group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "text-foreground/65 hover:text-foreground group-data-[variant=default]/tabs-list:data-[state=active]:border-border/70 group-data-[variant=default]/tabs-list:data-[state=active]:bg-background group-data-[variant=default]/tabs-list:data-[state=active]:text-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm",
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-b group-data-[variant=line]/tabs-list:border-border/60 group-data-[variant=line]/tabs-list:px-0 group-data-[variant=line]/tabs-list:pb-2 group-data-[variant=line]/tabs-list:pt-0 group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
        "after:bg-foreground after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
