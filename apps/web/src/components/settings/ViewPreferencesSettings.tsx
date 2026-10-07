"use client"
import { useState, useTransition } from "react"
import HoverDetail from "@/components/ui/HoverDetail"
import { AppIcon } from "@/components/ui/AppIcon"
import { SegmentedToggle, segmentedIconOptionClass } from "@/components/ui/SegmentedToggle"
import { updateViewPreference } from "./settings.actions"

export default function ViewPreferencesSettings({ 
  defaultView,
  defaultPracticesView
}: { 
  defaultView: string
  defaultPracticesView: string
}) {
  const [view, setView] = useState(defaultView)
  const [practicesView, setPracticesView] = useState(defaultPracticesView)
  const [pending, startTransition] = useTransition()

  function updateView(newView: string) {
    if (newView === view) return
    const previous = view
    setView(newView)

    startTransition(async () => {
      try {
        await updateViewPreference({ defaultView: newView })
      } catch {
        setView(previous)
      }
    })
  }

  function updatePracticesView(newView: string) {
    if (newView === practicesView) return
    const previous = practicesView
    setPracticesView(newView)

    startTransition(async () => {
      try {
        await updateViewPreference({ defaultPracticesView: newView })
      } catch {
        setPracticesView(previous)
      }
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
        <SegmentedToggle
          selectedIndex={view === "list" ? 1 : 0}
          className="shrink-0 rounded-lg border border-border bg-background"
        >
            <button 
              onClick={() => updateView("gallery")} 
              disabled={pending} 
              aria-label="Gallery View"
              className={"group relative " + segmentedIconOptionClass(view === "gallery")}
            >
              <AppIcon name="gallery" className="h-4 w-4 shrink-0" />
              <HoverDetail label="Gallery" />
            </button>
            <button 
              onClick={() => updateView("list")} 
              disabled={pending} 
              aria-label="List View"
              className={"group relative " + segmentedIconOptionClass(view === "list")}
            >
              <AppIcon name="list" className="h-4 w-4 shrink-0" />
              <HoverDetail label="List" />
            </button>
        </SegmentedToggle>
      </div>
      
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-sm text-foreground">Practices</p>
          <p className="text-xs text-foreground-secondary">
            Weekly, Monthly, or List view
          </p>
        </div>
        <SegmentedToggle
          selectedIndex={
            practicesView === "month" ? 1 : practicesView === "list" ? 2 : 0
          }
          className="shrink-0 rounded-lg border border-border bg-background"
        >
          <button 
            onClick={() => updatePracticesView("week")} 
            disabled={pending} 
            aria-label="Weekly View"
            className={"group relative " + segmentedIconOptionClass(practicesView === "week")}
          >
            <AppIcon name="calendarWeek" className="h-4 w-4 shrink-0" />
              <HoverDetail label="Week" />
          </button>
          <button 
            onClick={() => updatePracticesView("month")} 
            disabled={pending} 
            aria-label="Monthly View"
            className={"group relative " + segmentedIconOptionClass(practicesView === "month")}
          >
            <AppIcon name="calendarMonth" className="h-4 w-4 shrink-0" />
              <HoverDetail label="Month" />
          </button>
          <button 
            onClick={() => updatePracticesView("list")} 
            disabled={pending} 
            aria-label="List View"
            className={"group relative " + segmentedIconOptionClass(practicesView === "list")}
          >
            <AppIcon name="list" className="h-4 w-4 shrink-0" />
              <HoverDetail label="List" />
          </button>
        </SegmentedToggle>
      </div>
    </div>
  )
}
