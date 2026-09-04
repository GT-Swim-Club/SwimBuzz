"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import AthleteViewToggle from "@/components/athlete/AthleteViewToggle"
import HoverDetail from "@/components/ui/HoverDetail"
import RunScraperButton from "@/components/scraper/RunScraperButton"
import MobileNavMenu from "@/components/nav/MobileNavMenu"
import type { StaffTitle } from "@swimbuzz/shared"

type NavLink = { href: string; label: string; icon: ReactNode; prefetch?: boolean }
type HeaderMode = "full" | "staff-compact" | "links-compact" | "logo-only" | "medium" | "tight" | "menu"

type Props = {
  brand: ReactNode
  compactBrand: ReactNode
  utilities: ReactNode
  links: readonly NavLink[]
  /** The signed-in staff member's own title — drives the Athlete View toggle's label. */
  staffTitle: StaffTitle | null
  /** Current state of the ATHLETE_VIEW_COOKIE. */
  athleteViewEnabled: boolean
  showAthleteView: boolean
  showScraper: boolean
}

export default function AdaptiveHeaderLayout({
  brand,
  compactBrand,
  utilities,
  links,
  staffTitle,
  athleteViewEnabled,
  showAthleteView,
  showScraper,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fullRef = useRef<HTMLDivElement>(null)
  const staffCompactRef = useRef<HTMLDivElement>(null)
  const linksCompactRef = useRef<HTMLDivElement>(null)
  const logoOnlyRef = useRef<HTMLDivElement>(null)
  const mediumRef = useRef<HTMLDivElement>(null)
  const tightRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<HeaderMode>("full")

  useLayoutEffect(() => {
    const container = containerRef.current
    const full = fullRef.current
    const staffCompact = staffCompactRef.current
    const linksCompact = linksCompactRef.current
    const logoOnly = logoOnlyRef.current
    const medium = mediumRef.current
    const tight = tightRef.current
    const menu = menuRef.current
    if (!container || !full || !staffCompact || !linksCompact || !logoOnly || !medium || !tight || !menu) return

    const updateMode = () => {
      const width = container.clientWidth
      const nextMode: HeaderMode = full.scrollWidth <= width
        ? "full"
        : staffCompact.scrollWidth <= width
          ? "staff-compact"
          : linksCompact.scrollWidth <= width
            ? "links-compact"
            : logoOnly.scrollWidth <= width
          ? "logo-only"
          : medium.scrollWidth <= width
            ? "medium"
            : tight.scrollWidth <= width
              ? "tight"
              : "menu"
      setMode((current) => current === nextMode ? current : nextMode)
    }

    updateMode()
    const observer = new ResizeObserver(updateMode)
    observer.observe(container)
    observer.observe(full)
    observer.observe(staffCompact)
    observer.observe(linksCompact)
    observer.observe(logoOnly)
    observer.observe(medium)
    observer.observe(tight)
    observer.observe(menu)
    void document.fonts?.ready.then(updateMode)
    return () => observer.disconnect()
  }, [links, staffTitle, athleteViewEnabled, showAthleteView, showScraper])

  const staffCompact = mode !== "full"
  const linksCompact = mode === "links-compact" || mode === "logo-only" || mode === "medium" || mode === "tight"
  const medium = mode === "medium"
  const tight = mode === "tight"
  const menu = mode === "menu"
  const activeBrand = mode === "logo-only" || medium || tight ? compactBrand : brand

  return (
    <div ref={containerRef} className="flex min-w-0 w-full items-center justify-between gap-3">
      <div className={menu ? "hidden" : "flex min-w-0 flex-1 items-center gap-6"}>
        <div className="shrink-0">{activeBrand}</div>
        <div className="min-w-0 flex-1">
          <PrimaryLinks links={links} compact={linksCompact} medium={medium} tight={tight} />
        </div>
      </div>
      <div className={menu ? "hidden" : "flex shrink-0 items-center " + (tight ? "gap-1" : medium ? "gap-2" : "gap-3")}>
        <StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact={staffCompact} medium={medium} tight={tight} />
        {utilities}
      </div>

      {menu ? (
        <div className="flex w-full items-center justify-between gap-3">
          <div className="shrink-0">{compactBrand}</div>
          <div className="flex shrink-0 items-center gap-2">
            <MobileNavMenu
              links={[...links]}
              staffTools={<StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact={false} />}
            />
            {utilities}
          </div>
        </div>
      ) : null}

      <div ref={fullRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-3 whitespace-nowrap text-[15px]">
        <div>{brand}</div>
        <PrimaryLinks links={links} compact={false} />
        <StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact={false} />
        <div className="flex items-center gap-3">{utilities}</div>
      </div>
      <div ref={staffCompactRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-3 whitespace-nowrap text-[15px]">
        <div>{brand}</div>
        <PrimaryLinks links={links} compact={false} />
        <StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact />
        <div className="flex items-center gap-3">{utilities}</div>
      </div>
      <div ref={linksCompactRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-3 whitespace-nowrap">
        <div>{brand}</div>
        <PrimaryLinks links={links} compact />
        <StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact />
        <div className="flex items-center gap-3">{utilities}</div>
      </div>
      <div ref={logoOnlyRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-3 whitespace-nowrap">
        <div>{compactBrand}</div>
        <PrimaryLinks links={links} compact />
        <StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact />
        <div className="flex items-center gap-3">{utilities}</div>
      </div>
      <div ref={mediumRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-2 whitespace-nowrap">
        <div>{compactBrand}</div>
        <PrimaryLinks links={links} compact medium />
        <StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact medium />
        <div className="flex items-center gap-2">{utilities}</div>
      </div>
      <div ref={tightRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-1 whitespace-nowrap">
        <div>{compactBrand}</div>
        <PrimaryLinks links={links} compact tight />
        <StaffControls staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} showAthleteView={showAthleteView} showScraper={showScraper} compact tight />
        <div className="flex items-center gap-1">{utilities}</div>
      </div>
      <div ref={menuRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 flex w-max items-center gap-2 whitespace-nowrap">
        <div>{compactBrand}</div>
        <div className="flex items-center gap-2">
          <MobileNavMenu links={[...links]} />
          <div className="flex items-center gap-2">{utilities}</div>
        </div>
      </div>
    </div>
  )
}

function PrimaryLinks({ links, compact, medium = false, tight = false }: { links: readonly NavLink[]; compact: boolean; medium?: boolean; tight?: boolean }) {
  const pathname = usePathname()
  return (
    <div className={"flex shrink-0 items-center text-[15px] text-foreground-secondary " + (compact ? (tight ? "gap-1" : medium ? "gap-2" : "gap-3") : "gap-5")}>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={link.prefetch}
            aria-label={link.label}
            aria-current={active ? "page" : undefined}
            className={
              "group relative inline-flex h-9 shrink-0 items-center transition-colors " +
              (active ? "font-medium text-foreground" : "text-foreground-secondary hover:text-foreground") +
              " " +
              (compact
                ? "w-9 justify-center rounded-lg " + (active ? "bg-primary-bg" : "hover:bg-fill-secondary")
                : "gap-1.5 border-b-2 pb-4 -mb-4 " + (active ? "border-primary" : "border-transparent"))
            }
          >
            {link.icon}
            {compact ? <HoverDetail label={link.label} /> : <span>{link.label}</span>}
          </Link>
        )
      })}
    </div>
  )
}

function StaffControls({ staffTitle, athleteViewEnabled, showAthleteView, showScraper, compact, medium = false, tight = false }: {
  staffTitle: StaffTitle | null
  athleteViewEnabled: boolean
  showAthleteView: boolean
  showScraper: boolean
  compact: boolean
  medium?: boolean
  tight?: boolean
}) {
  if (!showAthleteView && !showScraper) return null
  return (
    <div className={"flex shrink-0 items-center " + (tight ? "gap-1" : medium ? "gap-2" : "gap-3")}>
      {showAthleteView && staffTitle ? (
        <AthleteViewToggle staffTitle={staffTitle} athleteViewEnabled={athleteViewEnabled} compact={compact} />
      ) : null}
      {showScraper ? <RunScraperButton compact={compact} /> : null}
    </div>
  )
}
