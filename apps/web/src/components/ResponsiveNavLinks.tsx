"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import HoverDetail from "@/components/HoverDetail"

type NavLink = {
  href: string
  label: string
  icon: ReactNode
  prefetch?: boolean
}

export default function ResponsiveNavLinks({
  links,
}: {
  links: readonly NavLink[]
}) {
  const availableRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  useLayoutEffect(() => {
    const available = availableRef.current
    const expanded = expandedRef.current
    if (!available || !expanded) return

    const updateMode = () => {
      const shouldCompact = expanded.scrollWidth > available.clientWidth
      setCompact((current) =>
        current === shouldCompact ? current : shouldCompact
      )
    }

    updateMode()
    const observer = new ResizeObserver(updateMode)
    observer.observe(available)
    observer.observe(expanded)
    void document.fonts?.ready.then(updateMode)

    return () => observer.disconnect()
  }, [links])

  return (
    <div ref={availableRef} className="relative min-w-0 flex-1">
      <div
        ref={expandedRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-5 whitespace-nowrap text-[15px]"
      >
        {links.map((link) => (
          <span key={link.href} className="inline-flex items-center gap-1.5">
            {link.icon}
            {link.label}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-5 text-[15px] text-foreground-secondary">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={link.prefetch}
            aria-label={link.label}
            className={
              "group relative inline-flex h-9 shrink-0 items-center text-foreground-secondary transition-colors hover:text-foreground " +
              (compact
                ? "w-9 justify-center rounded-lg hover:bg-fill-secondary"
                : "gap-1.5")
            }
          >
            {link.icon}
            {!compact ? <span>{link.label}</span> : null}
            {compact ? <HoverDetail label={link.label} /> : null}
          </Link>
        ))}
      </div>
    </div>
  )
}
