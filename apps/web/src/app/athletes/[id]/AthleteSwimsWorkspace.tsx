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

/** An event + course, and whether its relay splits are shown instead of its flat-start swims. */
type Selected = { event: string; course: string; splits: boolean }

/**
 * Personal bests sidebar beside either the full meet-grouped History or one event's
 * drill-down. The selected event lives in the URL (`?event=100-free&course=SCY`, plus
 * `&splits=1` for its relay splits).
 */
export default function AthleteSwimsWorkspace({
  swims,
  relaySplits,
  isCoach,
  isOwnProfile,
  athleteId,
  swimCloudIds,
  timesSyncedAt,
  highlights,
}: {
  swims: AthleteSwim[]
  /** Relay leg 2–4 splits: extra PB rows, History entries, and their own view of an event. */
  relaySplits: AthleteSwim[]
  isCoach: boolean
  isOwnProfile: boolean
  athleteId: string
  /** Main SwimCloud profile first, then the second one if any. */
  swimCloudIds: number[]
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
  const splitMarks = useMemo(() => computeSwimMarks(relaySplits), [relaySplits])

  const historySwims = useMemo(() => [...swims, ...relaySplits], [swims, relaySplits])

  const coursesWithSwims = useMemo(
    () => COURSE_SWITCH_ORDER.filter((c) => historySwims.some((s) => s.course === c)),
    [historySwims]
  )

  const has = (list: AthleteSwim[], event: string, eventCourse: string) =>
    list.some((s) => s.event === event && s.course === eventCourse)

  const selected = useMemo<Selected | null>(() => {
    const eventParam = searchParams.get("event")
    const course = searchParams.get("course")?.toUpperCase()
    if (!eventParam || !course) return null
    const match = historySwims.find((s) => s.course === course && eventToParam(s.event) === eventParam)
    if (!match) return null
    const hasFlat = swims.some((s) => s.event === match.event && s.course === course)
    const hasSplits = relaySplits.some((s) => s.event === match.event && s.course === course)
    // Whichever view the event has when the asked-for one is empty (e.g. splits only).
    const splits = searchParams.get("splits") === "1" ? hasSplits : !hasFlat
    return { event: match.event, course, splits }
  }, [searchParams, historySwims, swims, relaySplits])

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
      if (next.splits) params.set("splits", "1")
      else params.delete("splits")
    } else {
      params.delete("event")
      params.delete("course")
      params.delete("splits")
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

  function openEvent(event: string, eventCourse: string, splits = false) {
    setCourseChoice(eventCourse)
    const next = { event, course: eventCourse, splits }
    if (selected) {
      navigate(next, "replace")
    } else {
      navigate(next, "push")
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
    // Same view in the new course if it has one, else the event's other view there.
    const sameView = has(selected.splits ? relaySplits : swims, selected.event, next)
    const otherView = has(selected.splits ? swims : relaySplits, selected.event, next)
    if (sameView || otherView) {
      navigate({ event: selected.event, course: next, splits: sameView ? selected.splits : !selected.splits }, "replace")
    } else {
      backToHistory()
    }
  }

  const historyActions = isCoach ? (
    <>
      <ImportTimesButton athleteId={athleteId} swimCloudIds={swimCloudIds} timesSyncedAt={timesSyncedAt} />
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
    <RequestTimesImportButton athleteId={athleteId} swimCloudIds={swimCloudIds} timesSyncedAt={timesSyncedAt} />
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
              relaySplits={relaySplits}
              courses={coursesWithSwims}
              course={course}
              onCourseChange={changeCourse}
              selected={selected}
              onSelectEvent={(event, splits) =>
                selected?.event === event && selected.course === course && selected.splits === splits
                  ? backToHistory()
                  : openEvent(event, course, splits)
              }
            />
          </>
        }
      >
        <div ref={mainRef} className="flex scroll-mt-4 flex-col gap-4">
          {selected ? (
            <EventDrilldown
              // Fresh chart state (hover, full history) per view.
              key={selected.splits ? "splits" : "flat"}
              event={selected.event}
              course={selected.course}
              swims={selected.splits ? relaySplits : swims}
              marks={selected.splits ? splitMarks : marks}
              splits={selected.splits}
              onViewChange={
                has(swims, selected.event, selected.course) && has(relaySplits, selected.event, selected.course)
                  ? (splits) => navigate({ ...selected, splits }, "replace")
                  : undefined
              }
              isCoach={isCoach}
              onBack={backToHistory}
            />
          ) : (
            <SwimHistory
              swims={historySwims}
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
