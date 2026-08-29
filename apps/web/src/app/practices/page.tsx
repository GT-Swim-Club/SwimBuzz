import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import LoadingComponent from "./loading"
import { Prisma } from "@prisma/client"
import LiveSearch from "@/components/LiveSearch"
import {
  ViewNavPanel,
  ViewNavigationProvider } from "@/components/ViewNavigation"
import { formatDateRange } from "@/lib/utils"
import { DateTimeHoverGroup } from "@/components/RelativeDate"
import { zonedDayKey } from "@swimbuzz/shared"
import { normalizeTag } from "@/lib/practice-tags"
import { listManagedPracticeTags } from "@/lib/practice-tag-catalog"
import PracticeViewToggle from "./PracticeViewToggle"
import PracticeTagManager from "./PracticeTagManager"
import PracticeWeekGrid from "./PracticeWeekGrid"
import {
  DayLabel,
  PracticeCardShell,
  TodayButton } from "./PracticeCalendarLocal"
import { isStaffUi } from "@/lib/athlete-view-server"
import { practicePath } from "@/lib/slug"
import { getSession } from "@/lib/session"

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"]

type PracticeView = "week" | "month" | "list"

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function addUtcDays(date: Date, days: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)
  )
}

function startOfUtcWeek(date: Date) {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  return addUtcDays(day, -day.getUTCDay())
}

function formatMonthParam(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function formatDayParam(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`
}

function parseCalendarMonth(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const [year, month] = value.split("-").map(Number)
  if (month < 1 || month > 12) return null
  return new Date(Date.UTC(year, month - 1, 1))
}

function parseWeekStart(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return startOfUtcWeek(new Date(Date.UTC(year, month - 1, day)))
}

function parseView(value?: string): PracticeView {
  if (value === "list") return "list"
  if (value === "month" || value === "calendar") return "month"
  return "week"
}

function dayKey(date: Date) {
  return formatDayParam(date)
}

function parseTags(tag?: string | string[]): string[] {
  const parts = Array.isArray(tag) ? tag : tag ? [tag] : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    for (const raw of part.split(",")) {
      const value = normalizeTag(raw)
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

async function PracticesContent({
  searchParams}: {
  searchParams: Promise<{
    q?: string
    tag?: string | string[]
    view?: string
    month?: string
    week?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  const [isCoach, managedTags] = await Promise.all([
    isStaffUi(session.user.role),
    listManagedPracticeTags(),
  ])
  const { q, tag, view, month, week } = await searchParams
  const query = q?.trim() ?? ""
  const activeTags = parseTags(tag)
  const activeView = parseView(view)
  const now = new Date()
  const calendarMonth = parseCalendarMonth(month) ?? startOfUtcMonth(now)
  const nextCalendarMonth = addUtcMonths(calendarMonth, 1)
  const weekStart = parseWeekStart(week) ?? startOfUtcWeek(now)
  const weekEnd = addUtcDays(weekStart, 7)
  const weekDays = Array.from({ length: 7 }, (_, i) => addUtcDays(weekStart, i))

  const and: Prisma.PracticeWhereInput[] = []
  if (!isCoach) and.push({ published: true })
  if (query) {
    const contains = { contains: query, mode: "insensitive" as const }
    and.push({
      OR: [
        { title: contains },
        { focus: contains },
        {
          sets: {
            some: { OR: [{ title: contains }, { content: contains }] }}},
      ]})
  }
  if (activeTags.length) {
    and.push({ tags: { hasSome: activeTags } })
  }

  // Padded by a day on each side of the naive UTC window: a practice's zoned day can
  // differ from its startsAt's UTC day by up to a zone's offset (never a full day for US
  // zones), and the exact bucketing below re-filters by each practice's own zoned day key.
  const dateFilter: Prisma.PracticeWhereInput | null =
    activeView === "week"
      ? { startsAt: { gte: addUtcDays(weekStart, -1), lt: addUtcDays(weekEnd, 1) } }
      : activeView === "month"
        ? { startsAt: { gte: addUtcDays(calendarMonth, -1), lt: addUtcDays(nextCalendarMonth, 1) } }
        : null

  const whereAnd: Prisma.PracticeWhereInput[] = [
    ...and,
    ...(dateFilter ? [dateFilter] : []),
  ]

  const practices = await prisma.practice.findMany({
    where: whereAnd.length ? { AND: whereAnd } : undefined,
    orderBy:
      activeView === "list"
        ? [{ startsAt: "desc" }, { createdAt: "desc" }]
        : [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: {
      sets: { select: { distance: true, title: true } },
      _count: { select: { sets: true } }}})

  function practiceDayKey(practice: { startsAt: Date | null; createdAt: Date; timeZone: string }) {
    return zonedDayKey(practice.startsAt ?? practice.createdAt, practice.timeZone)
  }

  const practicesByDay = new Map<string, typeof practices>()
  for (const practice of practices) {
    const key = practiceDayKey(practice)
    const dayPractices = practicesByDay.get(key)
    if (dayPractices) dayPractices.push(practice)
    else practicesByDay.set(key, [practice])
  }

  function listParams(next: {
    q?: string
    tags?: string[]
    view?: PracticeView
    month?: string
    week?: string
  } = {}) {
    const params = new URLSearchParams()
    const qv = next.q ?? query
    const tags = next.tags ?? activeTags
    const vv = next.view ?? activeView
    const mv = next.month ?? (vv === "month" ? formatMonthParam(calendarMonth) : "")
    const wv = next.week ?? (vv === "week" ? formatDayParam(weekStart) : "")
    if (qv) params.set("q", qv)
    for (const t of tags) params.append("tag", t)
    if (vv === "list") params.set("view", "list")
    if (vv === "month") {
      params.set("view", "month")
      if (mv) params.set("month", mv)
    }
    if (vv === "week" && wv) params.set("week", wv)
    return params
  }

  function buildHref(
    next: {
      q?: string
      tags?: string[]
      view?: PracticeView
      month?: string
      week?: string
    } = {}
  ) {
    const s = listParams(next).toString()
    return s ? `/practices?${s}` : "/practices"
  }


  function practiceHref(practice: { id: string; slug: string | null }) {
    return practicePath(practice.slug ?? practice.id)
  }

  const monthLabel = `${MONTH_NAMES[calendarMonth.getUTCMonth()]} ${calendarMonth.getUTCFullYear()}`
  const weekLabel = formatDateRange(weekStart, addUtcDays(weekStart, 6))
  const todayCardClass = "ring-2 ring-primary/70"
  const todayButtonActiveClass =
    "border-primary bg-primary-bg text-primary pointer-events-none"
  const firstWeekday = calendarMonth.getUTCDay()
  const daysInMonth = new Date(
    Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const monthCellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const monthCells = Array.from({ length: monthCellCount }, (_, index) => {
    const dayOffset = index - firstWeekday
    return {
      date: addUtcDays(calendarMonth, dayOffset),
      inMonth: dayOffset >= 0 && dayOffset < daysInMonth}
  })

  const navButtonClass =
    "rounded-lg border border-border-secondary px-2.5 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary sm:px-3 bg-background border-border-secondary"

  type DayPractice = (typeof practices)[number]

  function PracticeCardContent({
    practice,
    tall}: {
    practice: DayPractice
    tall?: boolean
  }) {
    return (
      <>
        <p className={"font-medium text-foreground " + (tall ? "text-sm" : "text-xs sm:text-sm")}>
          {practice.title}
        </p>

        {(() => {
          const totalDistance = practice.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
          return totalDistance > 0 ? (
            <p className="flex items-center gap-1 text-xs font-medium text-foreground mt-0.5">
              <img src="/swimming-icon.png" alt="swimming" className="w-4 h-4 dark:invert" />
              {totalDistance.toLocaleString()} yards
            </p>
          ) : null
        })()}

        {(practice.tags as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {(practice.tags as string[]).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-primary/80 dark:bg-primary border-primary text-primary-text"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {tall && (
          <div className="mt-3 space-y-1">
            {practice.sets.map((set: any, i) => (
              <div key={i} className="text-xs text-foreground truncate">
                {set.title || "Set"}
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  function renderPracticeCell({
    dayKey: key,
    dayLabel,
    practices,
    tall}: {
    dayKey: string
    dayLabel: string
    practices: DayPractice[]
    tall?: boolean
  }) {
    if (practices.length > 0) {
      const [first, ...rest] = practices
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 h-full">
          <PracticeCardShell
            dayKey={key}
            href={practiceHref(first)}
            todayClassName={todayCardClass}
            className={
              "flex flex-col flex-1 rounded-lg border border-border-secondary bg-[#fcf8e8] dark:bg-[#3d3320] text-left transition-colors hover:bg-[#f2e6b6] dark:hover:bg-[#52442b] " +
              (tall ? "px-3 py-2.5" : "px-2 py-1.5")
            }
          >
            <div className="flex items-start justify-between gap-1">
              <DayLabel dayKey={key}>{dayLabel}</DayLabel>
              {isCoach && !first.published && (
                <span className="mt-0.5 shrink-0 rounded-full bg-primary/20 dark:bg-primary/30 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-active shadow-sm dark:text-primary-hover">
                  Draft
                </span>
              )}
            </div>
            <div className="mt-2" />
            <PracticeCardContent practice={first} tall={tall} />
          </PracticeCardShell>

          {rest.map((practice) => (
            <PracticeCardShell
              key={practice.id}
              dayKey={key}
              href={practiceHref(practice)}
              todayClassName={todayCardClass}
              className={
                "flex flex-col flex-1 rounded-lg border border-border-secondary bg-[#fcf8e8] dark:bg-[#3d3320] text-left transition-colors hover:bg-[#f2e6b6] dark:hover:bg-[#52442b] " +
                (tall ? "px-3 py-2.5" : "px-2 py-1.5")
              }
            >
              <PracticeCardContent practice={practice} tall={tall} />
            </PracticeCardShell>
          ))}
        </div>
      )
    }

    return (
      <div className="px-1">
        <DayLabel dayKey={key}>{dayLabel}</DayLabel>
      </div>
    )
  }

  const viewToggle = (
    <PracticeViewToggle
      activeView={activeView}
      hrefs={{
        week: buildHref({ view: "week" }),
        month: buildHref({ view: "month" }),
        list: buildHref({ view: "list" })}}
    />
  )

  return (
    <ViewNavigationProvider>
      <main className={activeView === "week" ? "flex w-full flex-col gap-6 md:h-[calc(100dvh-10.5rem)]" : "space-y-6"}>
        <h1 className="sr-only">Practices</h1>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            {viewToggle}
          {isCoach && (
            <Link
              href="/practices/new"
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-text hover:bg-primary-hover transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New practice
            </Link>
          )}
        </div>
      </div>

      <div className="shrink-0 space-y-3">
        <Suspense fallback={null}>
          <LiveSearch pathname="/practices" placeholder="Search practices and sets…" />
        </Suspense>

        <PracticeTagManager initialTags={managedTags} isCoach={isCoach} />
      </div>

      <ViewNavPanel>
      {activeView === "week" ? (
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href={buildHref({ week: formatDayParam(addUtcDays(weekStart, -7)) })}
                className={navButtonClass}
              >
                <span className="sm:hidden">←</span>
                <span className="hidden sm:inline">← Previous</span>
              </Link>
              <TodayButton
                view="week"
                query={query}
                tags={activeTags}
                currentWeek={formatDayParam(weekStart)}
                currentMonth={formatMonthParam(calendarMonth)}
                className={navButtonClass}
                activeClassName={todayButtonActiveClass}
              />
            </div>
            <div className="min-w-0 text-center">
              <h2 className="truncate text-base font-medium text-foreground sm:text-lg">
                {weekLabel}
              </h2>
              <p className="text-xs text-foreground-secondary">
                {practices.length} practice{practices.length === 1 ? "" : "s"}
              </p>
            </div>
            <Link
              href={buildHref({ week: formatDayParam(addUtcDays(weekStart, 7)) })}
              className={navButtonClass}
            >
              <span className="sm:hidden">→</span>
              <span className="hidden sm:inline">Next →</span>
            </Link>
          </div>

          {/* Mobile: stacked day list */}
          <div className="space-y-2 md:hidden">
            {weekDays.map((date) => {
              const key = dayKey(date)
              const practices = practicesByDay.get(key) || []
              const weekday = WEEKDAYS[date.getUTCDay()]
              return (
                <div
                  key={key}
                  className="min-h-16 rounded-xl border border-border-secondary bg-background p-2 border-border-secondary"
                >
                  {renderPracticeCell({
                    dayKey: key,
                    dayLabel: `${weekday} ${date.getUTCDate()}`,
                    practices,
                    tall: true})}
                </div>
              )
            })}
          </div>

          {/* Desktop: 7-column week grid */}
          <div className="hidden min-h-0 overflow-hidden rounded-xl border border-border-secondary bg-background md:flex md:flex-1 md:flex-col">
            <div className="grid shrink-0 grid-cols-7 border-b border-border-secondary bg-fill-secondary text-center text-xs font-medium uppercase tracking-wide text-foreground-secondary">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="px-2 py-2">
                  {weekday}
                </div>
              ))}
            </div>
            <PracticeWeekGrid>
                {weekDays.map((date) => {
                  const key = dayKey(date)
                  const practices = practicesByDay.get(key) || []
                  return (
                    <div
                      key={key}
                      className="flex min-h-0 flex-col overflow-y-auto border-b border-r border-border-secondary p-1.5 last:border-r-0"
                    >
                      {renderPracticeCell({
                        dayKey: key,
                        dayLabel: String(date.getUTCDate()),
                        practices,
                        tall: true})}
                    </div>
                  )
                })}
            </PracticeWeekGrid>
          </div>
        </section>
      ) : activeView === "month" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href={buildHref({
                  month: formatMonthParam(addUtcMonths(calendarMonth, -1))})}
                className={navButtonClass}
              >
                <span className="sm:hidden">←</span>
                <span className="hidden sm:inline">← Previous</span>
              </Link>
              <TodayButton
                view="month"
                query={query}
                tags={activeTags}
                currentWeek={formatDayParam(weekStart)}
                currentMonth={formatMonthParam(calendarMonth)}
                className={navButtonClass}
                activeClassName={todayButtonActiveClass}
              />
            </div>
            <div className="min-w-0 text-center">
              <h2 className="truncate text-base font-medium text-foreground sm:text-lg">
                {monthLabel}
              </h2>
              <p className="text-xs text-foreground-secondary">
                {practices.length} practice{practices.length === 1 ? "" : "s"}
              </p>
            </div>
            <Link
              href={buildHref({
                month: formatMonthParam(addUtcMonths(calendarMonth, 1))})}
              className={navButtonClass}
            >
              <span className="sm:hidden">→</span>
              <span className="hidden sm:inline">Next →</span>
            </Link>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
            <div className="min-w-[28rem] overflow-hidden rounded-xl border border-border-secondary bg-background md:min-w-0">
              <div className="grid grid-cols-7 border-b border-border-secondary bg-fill-secondary text-center text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                {WEEKDAYS.map((weekday, i) => (
                  <div key={weekday} className="px-1 py-2 sm:px-2">
                    <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
                    <span className="hidden sm:inline">{weekday}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map(({ date, inMonth }) => {
                  const key = dayKey(date)
                  const practices = practicesByDay.get(key) || []
                  return (
                    <div
                      key={key}
                      className={"flex min-h-24 flex-col border-b border-r border-border-secondary p-1 last:border-r-0 sm:min-h-28 sm:p-1.5 md:min-h-36 " + (inMonth ? "bg-background" : "bg-fill-secondary/70")}
                    >
                      {inMonth || practices.length > 0 ? (
                        renderPracticeCell({
                          dayKey: key,
                          dayLabel: String(date.getUTCDate()),
                          practices})
                      ) : (
                        <div className="px-1 text-xs font-medium text-foreground-tertiary/60">
                          {date.getUTCDate()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      ) : practices.length === 0 ? (
        <div className="border border-border-secondary rounded-xl px-4 py-12 text-center text-sm text-foreground-secondary text-foreground-secondary bg-background bg-background">
          {query || activeTags.length
            ? "No practices match your search."
            : isCoach
              ? "No practices yet. Create one to get started."
              : "No practices posted yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {practices.map((p) => {
            const tags = p.tags as string[]
            const totalDistance = p.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
            const key = practiceDayKey(p)
            return (
              <PracticeCardShell
                key={p.id}
                dayKey={key}
                href={practiceHref(p)}
                todayClassName="!border-primary"
                className="flex items-center gap-4 rounded-xl border border-border-secondary bg-background px-6 py-4 transition-colors hover:bg-fill-secondary"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-base text-foreground truncate">
                    {p.title}
                  </p>
                  {isCoach && !p.published && (
                    <span className="text-xs uppercase tracking-wide rounded-full bg-primary/20 dark:bg-primary/30 px-1.5 py-px text-primary-active shadow-sm dark:text-primary-hover shrink-0">
                      Draft
                    </span>
                  )}
                </div>
                {totalDistance > 0 && (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mt-0.5">
                    <img src="/swimming-icon.png" alt="swimming" className="w-4 h-4 dark:invert" />
                    {totalDistance.toLocaleString()} yards
                  </p>
                )}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-primary/80 dark:bg-primary border-primary text-primary-text"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-right text-sm text-foreground-secondary space-y-1">
                <DateTimeHoverGroup
                  startsAt={p.startsAt ?? p.createdAt}
                  endsAt={p.endsAt}
                  timeZone={p.timeZone}
                  dateIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  }
                  timeIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  }
                />
                <div className="flex items-center justify-end gap-1.5 font-semibold">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {p.location}
                </div>
              </div>

              <span className="text-border">→</span>
            </PracticeCardShell>
            )
          })}
        </div>
      )}
      </ViewNavPanel>
    </main>
    </ViewNavigationProvider>
  )
}

export default function PracticesPage(props: {
  searchParams: Promise<{
    q?: string
    tag?: string | string[]
    view?: string
    month?: string
    week?: string
  }>
}) {
  return (
    <Suspense fallback={<LoadingComponent />}>
      <PracticesContent {...props} />
    </Suspense>
  )
}
