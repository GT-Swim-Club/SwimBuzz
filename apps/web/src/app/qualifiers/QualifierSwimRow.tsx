"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import HoverDetail from "@/components/ui/HoverDetail"
import type { QualifierRow } from "@/lib/qualifiers/nationals-qualifiers"
import { qualifierSwimHref } from "@/lib/qualifiers/qualifier-events"

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
      className={`${className} hover:bg-primary-bg/70 ${highlight ? "bg-primary-bg/60" : ""}`}
    >
      {children}
    </Link>
  ) : (
    <div aria-label={ariaLabel} className={`${className} ${highlight ? "bg-primary-bg/60" : "bg-fill-secondary/45"}`}>
      {children}
    </div>
  )
}
