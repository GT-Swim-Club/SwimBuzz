"use client"

import { ViewNavLink, useViewNav } from "@/components/ViewNavigation"
import { AppIcon } from "@/components/AppIcon"
import { SegmentedToggle, segmentedIconOptionClass } from "@/components/SegmentedToggle"
import type { IconName } from "@swimbuzz/shared"

type PracticeView = "week" | "month" | "list"

const OPTIONS: Array<{
  view: PracticeView
  label: string
  icon: IconName
}> = [
  { view: "week", label: "Week", icon: "calendarWeek" },
  { view: "month", label: "Month", icon: "calendarMonth" },
  { view: "list", label: "List", icon: "list" },
]

export default function PracticeViewToggle({
  activeView,
  hrefs,
}: {
  activeView: PracticeView
  hrefs: Record<PracticeView, string>
}) {
  const { pendingView } = useViewNav()
  const shown =
    pendingView === "week" || pendingView === "month" || pendingView === "list"
      ? pendingView
      : activeView

  return (
    <SegmentedToggle
      selectedIndex={Math.max(0, OPTIONS.findIndex((option) => option.view === shown))}
      className="rounded-lg border border-border-secondary bg-background"
    >
      {OPTIONS.map((option) => (
        <ViewNavLink
          key={option.view}
          href={hrefs[option.view]}
          view={option.view}
          active={activeView === option.view}
          title={option.label}
          className={segmentedIconOptionClass(shown === option.view)}
        >
          <AppIcon name={option.icon} className="h-4 w-4 shrink-0" />
        </ViewNavLink>
      ))}
    </SegmentedToggle>
  )
}
