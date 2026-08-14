"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import AthleteViewToggle from "@/components/AthleteViewToggle"
import HoverDetail from "@/components/HoverDetail"
import RunScraperButton from "@/components/RunScraperButton"

type NavLink = {
  href: string
  label: string
  icon: ReactNode
  prefetch?: boolean
}

type Athlete = { id: string; name: string }

export default function AdaptiveHeaderNavigation({
  links,
  athletes,
  selectedAthleteId,
  showAthleteView,
  showScraper,
}: {
  links: readonly NavLink[]
  athletes: Athlete[]
  selectedAthleteId: string | null
  showAthleteView: boolean
  showScraper: boolean
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
  }, [links, athletes, selectedAthleteId, showAthleteView, showScraper])

  return (
    <div ref={availableRef} className="relative min-w-0 flex-1">
        <div
          ref={expandedRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-5 whitespace-nowrap text-[15px]"
        >
          <PrimaryLinks links={links} compact={false} />
          <StaffControls
            athletes={athletes}
            selectedAthleteId={selectedAthleteId}
            showAthleteView={showAthleteView}
            showScraper={showScraper}
            compact={false}
          />
        </div>

        <div className="flex items-center gap-5 text-[15px] text-foreground-secondary">
          <PrimaryLinks links={links} compact={compact} />
          <StaffControls
            athletes={athletes}
            selectedAthleteId={selectedAthleteId}
            showAthleteView={showAthleteView}
            showScraper={showScraper}
            compact={compact}
          />
        </div>
      </div>
  )
}

function PrimaryLinks({
  links,
  compact,
}: {
  links: readonly NavLink[]
  compact: boolean
}) {
  return (
    <div className="flex shrink-0 items-center gap-5">
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
          {compact ? <HoverDetail label={link.label} /> : <span>{link.label}</span>}
        </Link>
      ))}
    </div>
  )
}

function StaffControls({
  athletes,
  selectedAthleteId,
  showAthleteView,
  showScraper,
  compact,
}: {
  athletes: Athlete[]
  selectedAthleteId: string | null
  showAthleteView: boolean
  showScraper: boolean
  compact: boolean
}) {
  if (!showAthleteView && !showScraper) return null

  return (
    <div className="flex shrink-0 items-center gap-3">
      {showAthleteView ? (
        <AthleteViewToggle
          athletes={athletes}
          selectedAthleteId={selectedAthleteId}
          compact={compact}
        />
      ) : null}
      {showScraper ? <RunScraperButton compact={compact} /> : null}
    </div>
  )
}
