"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import HoverDetail from "@/components/ui/HoverDetail"
import type { QualifierRow } from "@/lib/qualifiers/nationals-qualifiers"
import { qualifierMarginLabel, qualifierSwimHref } from "@/lib/qualifiers/qualifier-events"
import { meTintClass } from "./qualifier-styles"

/** Hover card listing a qualifying swim's details, for the compact gallery rows. */
export function SwimDetailPanel({ details }: { details: [label: string, value: string][] }) {
  return (
    <HoverDetail
      offset={8}
      desktopOnly
      className="w-64 max-w-[calc(100vw-2rem)] whitespace-normal rounded-lg p-2.5 text-left shadow-xl"
    >
      <span className="block space-y-1.5 text-xs">
        {details.map(([label, value]) => (
          <span key={label} className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-foreground-tertiary">{label}</span>
            <span className="min-w-0 truncate text-right font-medium text-foreground">{value}</span>
          </span>
        ))}
      </span>
    </HoverDetail>
  )
}

/**
 * A qualifying swim: links to the swim on its meet page, or — for swims
 * without a meet — a static row on a muted fill. `highlight` tints the
 * viewer's own swims.
 */
export function QualifierSwimRow({
  swim,
  className,
  ariaLabel,
  highlight = false,
  children,
}: {
  swim: QualifierRow
  className: string
  ariaLabel?: string
  highlight?: boolean
  children: ReactNode
}) {
  const href = qualifierSwimHref(swim)
  return href ? (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`${className} hover:bg-[var(--qualifier-row-hover,var(--brand-color-bg-hover))] ${highlight ? meTintClass : ""}`}
    >
      {children}
    </Link>
  ) : (
    <div aria-label={ariaLabel} className={`${className} ${highlight ? meTintClass : "bg-fill-secondary/45"}`}>
      {children}
    </div>
  )
}

/** A qualifying time with how far under the cut it is, for the compact gallery rows. */
export function GallerySwimTime({ swim }: { swim: QualifierRow }) {
  return (
    <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-foreground">
      {swim.time}
      <span className="ml-1.5 text-xs font-medium text-success-text">{qualifierMarginLabel(swim)}</span>
    </span>
  )
}
