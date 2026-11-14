"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * DIVERGES FROM UPSTREAM SHADCN (#450) — `npx shadcn add table` will clobber
 * this file and bring back a scroll container that keyboard users cannot
 * reach.
 *
 * Upstream wraps every table in an `overflow-x-auto` div with no tab stop.
 * When a table is wider than its card, axe reports
 * `scrollable-region-focusable` and a keyboard user has no way to scroll the
 * hidden columns. The container becomes a focusable, named region only while
 * it is actually overflowing, so a table that fits gains no pointless tab
 * stop. Callers pass the card's title as `containerLabel`; the fallback keeps
 * the region named for any table that does not.
 */
function Table({
  className,
  containerLabel = "Table",
  ...props
}: React.ComponentProps<"table"> & { containerLabel?: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = React.useState(false)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      setIsOverflowing(container.scrollWidth > container.clientWidth)
    }

    measure()

    if (typeof ResizeObserver === "undefined") return

    // Observe both the card-sized container and the table inside it: the
    // container changes when the viewport does, and the table changes when
    // its rows or cell contents do.
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    const table = container.querySelector("table")
    if (table) observer.observe(table)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      role={isOverflowing ? "region" : undefined}
      aria-label={isOverflowing ? containerLabel : undefined}
      tabIndex={isOverflowing ? 0 : undefined}
      className={cn(
        "relative w-full overflow-x-auto",
        isOverflowing &&
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
