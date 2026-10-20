"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import ResizableSidebarLayout from "@/components/ui/ResizableSidebarLayout"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { COURSE_SWITCH_ORDER } from "@/lib/swim/swim-parse"
import { computeSwimMarks, eventToParam, type AthleteSwim } from "@/lib/athlete/swim-history"
import PersonalBestsSidebar from "./PersonalBestsSidebar"
import EventDrilldown from "./EventDrilldown"
import SwimHistory from "./SwimHistory"
import ImportTimesButton from "./ImportTimesButton"
import RequestTimesImportButton from "./RequestTimesImportButton"
import LogSwimModal from "./LogSwimModal"
import { ICON_BUTTON } from "./AthleteIconButton"

type Selected = { event: string; course: string }

/**
 * Personal bests sidebar beside either the full meet-grouped History or one event's
 * drill-down. The selected event lives in the URL (`?event=100-free&course=SCY`).
 */
export default function AthleteSwimsWorkspace({
  swims,
  isCoach,
  isOwnProfile,
  athleteId,
  swimCloudId,
  timesSyncedAt,
  highlights,
}: {
  swims: AthleteSwim[]
  isCoach: boolean
  isOwnProfile: boolean
  athleteId: string
  swimCloudId: number | null
  timesSyncedAt: string | null
  /** Season highlights card shown above the personal bests. */
  highlights?: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mainRef = useRef<HTMLDivElement>(null)
  // Whether this tab pushed the current event entry, so "← History" can pop it instead of stacking another.
  const pushedRef = useRef(false)
  const [courseChoice, setCourseChoice] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [logOpen, setLogOpen] = useState(false)

  const marks = useMemo(() => computeSwimMarks(swims), [swims])

  const coursesWithSwims = useMemo(
    () => COURSE_SWITCH_ORDER.filter((c) => swims.some((s) => s.course === c)),
    [swims]
  )

  const selected = useMemo<Selected | null>(() => {
    const eventParam = searchParams.get("event")
    const course = searchParams.get("course")?.toUpperCase()
    if (!eventParam || !course) return null
    const match = swims.find((s) => s.course === course && eventToParam(s.event) === eventParam)
    return match ? { event: match.event, course } : null
  }, [searchParams, swims])

  const course =
    selected?.course ??
    (courseChoice && coursesWithSwims.includes(courseChoice as (typeof COURSE_SWITCH_ORDER)[number])
      ? courseChoice
      : coursesWithSwims[0] ?? "SCY")

  function navigate(next: Selected | null, mode: "push" | "replace") {
    const params = new URLSearchParams(searchParams.toString())
    if (next) {
      params.set("event", eventToParam(next.event))
      params.set("course", next.course)
    } else {
      params.delete("event")
      params.delete("course")
    }
    const qs = params.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    // Native history calls sync with useSearchParams without re-running the server page —
    // the drill-down is built from swims already on the client, so router.push would only
    // add a round trip (session + every swim query) before the click shows anything.
    if (mode === "push") window.history.pushState(null, "", url)
    else window.history.replaceState(null, "", url)
  }

  /** Bring the main column into view: always when stacked under the sidebar, else only if scrolled past. */
  function revealMain() {
    requestAnimationFrame(() => {
      const el = mainRef.current
      const scrollEl = document.getElementById("page-scroll")
      if (!el || !scrollEl) return
      const stacked = window.matchMedia("(max-width: 900px)").matches
      const above = el.getBoundingClientRect().top < scrollEl.getBoundingClientRect().top
      if (stacked || above) el.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  function openEvent(event: string, eventCourse: string) {
    setCourseChoice(eventCourse)
    if (selected) {
      navigate({ event, course: eventCourse }, "replace")
    } else {
      navigate({ event, course: eventCourse }, "push")
      pushedRef.current = true
    }
    revealMain()
  }

  function backToHistory() {
    if (pushedRef.current) {
      pushedRef.current = false
      router.back()
    } else {
      navigate(null, "replace")
    }
  }

  function changeCourse(next: string) {
    setCourseChoice(next)
    if (!selected) return
    if (swims.some((s) => s.event === selected.event && s.course === next)) {
      navigate({ event: selected.event, course: next }, "replace")
    } else {
      backToHistory()
    }
  }

  const historyActions = isCoach ? (
    <>
      <ImportTimesButton athleteId={athleteId} swimCloudId={swimCloudId} timesSyncedAt={timesSyncedAt} />
      <button
        type="button"
        onClick={() => setLogOpen(true)}
        aria-label="Log a swim"
        className={`${ICON_BUTTON} h-[34px] w-[34px]`}
      >
        <AppIcon name="plus" className="h-[18px] w-[18px]" />
        <HoverDetail label="Log a swim" />
      </button>
    </>
  ) : isOwnProfile ? (
    <RequestTimesImportButton athleteId={athleteId} swimCloudId={swimCloudId} timesSyncedAt={timesSyncedAt} />
  ) : null

  return (
    <>
      <ResizableSidebarLayout
        storageKey="swimbuzz-athlete-events-width"
        defaultWidth={340}
        minWidth={310}
        maxWidth={520}
        sidebarClassName="gap-6"
        mainClassName="gap-4"
        sidebar={
          <>
            {highlights}
            <PersonalBestsSidebar
              swims={swims}
              courses={coursesWithSwims}
              course={course}
              onCourseChange={changeCourse}
              selected={selected}
              onSelectEvent={(event) =>
                selected?.event === event && selected.course === course
                  ? backToHistory()
                  : openEvent(event, course)
              }
            />
          </>
        }
      >
        <div ref={mainRef} className="flex scroll-mt-4 flex-col gap-4">
          {selected ? (
            <EventDrilldown
              event={selected.event}
              course={selected.course}
              swims={swims}
              marks={marks}
              isCoach={isCoach}
              onBack={backToHistory}
            />
          ) : (
            <SwimHistory
              swims={swims}
              marks={marks}
              isCoach={isCoach}
              onOpenEvent={openEvent}
              page={historyPage}
              onPageChange={setHistoryPage}
              actions={historyActions}
            />
          )}
        </div>
      </ResizableSidebarLayout>

      {isCoach && (
        <LogSwimModal
          open={logOpen}
          onClose={() => setLogOpen(false)}
          athleteId={athleteId}
          defaultCourse={course}
        />
      )}
    </>
  )
}
