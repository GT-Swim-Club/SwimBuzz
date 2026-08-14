"use client"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import HoverDetail from "@/components/HoverDetail"

const iconProps = {
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

export default function ViewPreferencesSettings({ 
  defaultView,
  defaultPracticesView
}: { 
  defaultView: string
  defaultPracticesView: string
}) {
  const router = useRouter()
  const [view, setView] = useState(defaultView)
  const [practicesView, setPracticesView] = useState(defaultPracticesView)
  const [pending, startTransition] = useTransition()

  function updateView(newView: string) {
    if (newView === view) return
    setView(newView)

    startTransition(async () => {
      const res = await fetch("/api/user/view-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultView: newView }),
      })
      if (!res.ok) {
        setView(view)
        return
      }
      router.refresh()
    })
  }
  
  function updatePracticesView(newView: string) {
    if (newView === practicesView) return
    setPracticesView(newView)

    startTransition(async () => {
      const res = await fetch("/api/user/view-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPracticesView: newView }),
      })
      if (!res.ok) {
        setPracticesView(practicesView)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="divide-y divide-border">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-sm text-foreground">Roster, Meets, Nationals</p>
          <p className="text-xs text-foreground-secondary">
            Gallery or List view
          </p>
        </div>
        <div role="radiogroup" className="inline-flex shrink-0 rounded-lg border border-border p-0.5" aria-label="Default View">
            <button 
              onClick={() => updateView("gallery")} 
              disabled={pending} 
              aria-label="Gallery View"
              className={`group relative inline-flex items-center justify-center rounded-md p-2 transition-colors ${view === "gallery" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:text-foreground"}`}
            >
              <svg {...iconProps}>
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <HoverDetail label="Gallery" />
            </button>
            <button 
              onClick={() => updateView("list")} 
              disabled={pending} 
              aria-label="List View"
              className={`group relative inline-flex items-center justify-center rounded-md p-2 transition-colors ${view === "list" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:text-foreground"}`}
            >
              <svg {...iconProps}>
                <path d="M8 6h13" />
                <path d="M8 12h13" />
                <path d="M8 18h13" />
                <path d="M3 6h.01" />
                <path d="M3 12h.01" />
                <path d="M3 18h.01" />
              </svg>
              <HoverDetail label="List" />
            </button>
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-sm text-foreground">Practices</p>
          <p className="text-xs text-foreground-secondary">
            Weekly, Monthly, or List view
          </p>
        </div>
        <div role="radiogroup" className="inline-flex shrink-0 rounded-lg border border-border p-0.5" aria-label="Default Practices View">
          <button 
            onClick={() => updatePracticesView("week")} 
            disabled={pending} 
            aria-label="Weekly View"
            className={`group relative inline-flex items-center justify-center rounded-md p-2 transition-colors ${practicesView === "week" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:text-foreground"}`}
          >
            <svg {...iconProps}>
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
              <path d="M10 14h4" />
              <path d="M10 18h4" />
            </svg>
              <HoverDetail label="Week" />
          </button>
          <button 
            onClick={() => updatePracticesView("month")} 
            disabled={pending} 
            aria-label="Monthly View"
            className={`group relative inline-flex items-center justify-center rounded-md p-2 transition-colors ${practicesView === "month" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:text-foreground"}`}
          >
            <svg {...iconProps}>
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
              <HoverDetail label="Month" />
          </button>
          <button 
            onClick={() => updatePracticesView("list")} 
            disabled={pending} 
            aria-label="List View"
            className={`group relative inline-flex items-center justify-center rounded-md p-2 transition-colors ${practicesView === "list" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:text-foreground"}`}
          >
            <svg {...iconProps}>
              <path d="M8 6h13" />
              <path d="M8 12h13" />
              <path d="M8 18h13" />
              <path d="M3 6h.01" />
              <path d="M3 12h.01" />
              <path d="M3 18h.01" />
            </svg>
              <HoverDetail label="List" />
          </button>
        </div>
      </div>
    </div>
  )
}
