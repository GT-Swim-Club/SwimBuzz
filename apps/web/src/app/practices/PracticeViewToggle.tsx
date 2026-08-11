"use client"

import { ViewNavLink } from "@/components/ViewNavigation"

type PracticeView = "week" | "month" | "list"

const viewIconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4 shrink-0",
  "aria-hidden": true as const,
}

const OPTIONS: Array<{
  view: PracticeView
  label: string
  icon: React.ReactNode
}> = [
  {
    view: "week",
    label: "Week",
    icon: (
      <svg {...viewIconProps}>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    ),
  },
  {
    view: "month",
    label: "Month",
    icon: (
      <svg {...viewIconProps}>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
        <path d="M16 18h.01" />
      </svg>
    ),
  },
  {
    view: "list",
    label: "List",
    icon: (
      <svg {...viewIconProps}>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    ),
  },
]

export default function PracticeViewToggle({
  activeView,
  hrefs,
}: {
  activeView: PracticeView
  hrefs: Record<PracticeView, string>
}) {
  return (
    <div className="inline-flex rounded-lg border border-border-secondary bg-background p-1 text-sm">
      {OPTIONS.map((option) => (
        <ViewNavLink
          key={option.view}
          href={hrefs[option.view]}
          view={option.view}
          active={activeView === option.view}
          title={option.label}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors " +
            (activeView === option.view
              ? "bg-primary text-primary-text"
              : "text-foreground-secondary hover:bg-fill-secondary")
          }
        >
          {option.icon}
        </ViewNavLink>
      ))}
    </div>
  )
}
