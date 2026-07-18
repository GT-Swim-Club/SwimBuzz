import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Prisma } from "@prisma/client"
import LiveSearch from "@/components/LiveSearch"
import { formatDateRange, formatSwimDate } from "@/lib/utils"
import { SET_TAGS, normalizeTag } from "@/lib/practice-tags"
import {
  DayLabel,
  PracticeCardShell,
  TodayButton,
} from "./PracticeCalendarLocal"
import { isStaffUi } from "@/lib/athlete-view-server"

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

export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    tag?: string | string[]
    view?: string
    month?: string
    week?: string
  }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/signin?callbackUrl=/practices")

  const isCoach = await isStaffUi(session.user.role)
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
            some: { OR: [{ title: contains }, { content: contains }, { notes: contains }] },
          },
        },
      ],
    })
  }
  if (activeTags.length) {
    and.push({ sets: { some: { tags: { hasSome: activeTags } } } })
  }

  const dateFilter: Prisma.PracticeWhereInput | null =
    activeView === "week"
      ? { date: { gte: weekStart, lt: weekEnd } }
      : activeView === "month"
        ? { date: { gte: calendarMonth, lt: nextCalendarMonth } }
        : null

  const whereAnd: Prisma.PracticeWhereInput[] = [
    ...and,
    ...(dateFilter ? [dateFilter] : []),
  ]

  const practices = await prisma.practice.findMany({
    where: whereAnd.length ? { AND: whereAnd } : undefined,
    orderBy:
      activeView === "list"
        ? [{ date: "desc" }, { createdAt: "desc" }]
        : [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      sets: { select: { tags: true, distance: true } },
      _count: { select: { sets: true } },
    },
  })

  const practicesByDay = new Map<string, typeof practices>()
  for (const practice of practices) {
    if (!practice.date) continue
    const key = dayKey(practice.date)
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

  function toggleTagHref(tagName: string) {
    const next = activeTags.includes(tagName)
      ? activeTags.filter((t) => t !== tagName)
      : [...activeTags, tagName]
    return buildHref({ tags: next })
  }

  function practiceHref(id: string) {
    const s = listParams().toString()
    return s ? `/practices/${id}?${s}` : `/practices/${id}`
  }

  const monthLabel = `${MONTH_NAMES[calendarMonth.getUTCMonth()]} ${calendarMonth.getUTCFullYear()}`
  const weekLabel = formatDateRange(weekStart, addUtcDays(weekStart, 6))
  const todayCardClass = "ring-2 ring-indigo-500/70 dark:ring-indigo-400/50"
  const todayButtonActiveClass =
    "border-indigo-200 bg-indigo-50 text-indigo-700 pointer-events-none dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300"
  const firstWeekday = calendarMonth.getUTCDay()
  const daysInMonth = new Date(
    Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const monthCellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const monthCells = Array.from({ length: monthCellCount }, (_, index) => {
    const dayOffset = index - firstWeekday
    return {
      date: addUtcDays(calendarMonth, dayOffset),
      inMonth: dayOffset >= 0 && dayOffset < daysInMonth,
    }
  })

  const navButtonClass =
    "rounded-lg border px-2.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:px-3"

  type DayPractice = (typeof practices)[number]

  function renderPracticeCell({
    dayKey: key,
    dayLabel,
    practice,
    tall,
  }: {
    dayKey: string
    dayLabel: string
    practice?: DayPractice
    tall?: boolean
  }) {
    const tags = practice ? [...new Set(practice.sets.flatMap((s) => s.tags))] : []
    const totalDistance = practice
      ? practice.sets.reduce((sum, set) => sum + (set.distance ?? 0), 0)
      : 0

    if (!practice) {
      return (
        <div className="px-1">
          <DayLabel dayKey={key}>{dayLabel}</DayLabel>
        </div>
      )
    }

    return (
      <PracticeCardShell
        dayKey={key}
        href={practiceHref(practice.id)}
        todayClassName={todayCardClass}
        className={
          "flex min-h-0 flex-1 flex-col rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-left transition-colors hover:bg-indigo-100 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 " +
          (tall ? "px-3 py-2.5" : "")
        }
      >
        <div className="flex items-start justify-between gap-1">
          <DayLabel dayKey={key}>{dayLabel}</DayLabel>
          {isCoach && !practice.published && (
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          )}
        </div>
        <p
          className={
            "mt-1 font-medium leading-snug text-indigo-950 dark:text-indigo-100 " +
            (tall
              ? "line-clamp-4 text-sm"
              : "line-clamp-2 text-xs sm:text-sm")
          }
        >
          {practice.title}
        </p>
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.slice(0, tall ? 6 : 4).map((t) => (
              <span
                key={t}
                className="rounded bg-indigo-100/80 px-1 py-0.5 text-[9px] uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="mt-auto pt-1 text-[10px] text-indigo-700/80 dark:text-indigo-300/80 sm:text-xs">
          {practice._count.sets} set{practice._count.sets === 1 ? "" : "s"}
          {totalDistance > 0 ? ` · ${totalDistance.toLocaleString()}` : ""}
        </p>
      </PracticeCardShell>
    )
  }

  const viewIconProps = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-3.5 w-3.5 shrink-0",
    "aria-hidden": true as const,
  }

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-sm dark:border-zinc-700 dark:bg-zinc-950">
      {(
        [
          {
            view: "week" as const,
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
            view: "month" as const,
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
            view: "list" as const,
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
        ] as const
      ).map((option) => (
        <Link
          key={option.view}
          href={buildHref({ view: option.view })}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors sm:px-3 " +
            (activeView === option.view
              ? "bg-gray-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800")
          }
        >
          {option.icon}
          <span className="hidden sm:inline">{option.label}</span>
        </Link>
      ))}
    </div>
  )

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-medium">Practices</h1>
        <div className="flex items-center gap-2">
          {viewToggle}
          {isCoach && (
            <Link
              href="/practices/new"
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
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

      <div className="space-y-3">
        <Suspense fallback={null}>
          <LiveSearch pathname="/practices" placeholder="Search practices and sets…" />
        </Suspense>

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ tags: [] })}
            className={
              "text-xs px-2.5 py-1 rounded-full border transition-colors " +
              (activeTags.length === 0
                ? "bg-gray-900 border-gray-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900"
                : "border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800")
            }
          >
            All
          </Link>
          {SET_TAGS.map((t) => {
            const selected = activeTags.includes(t)
            return (
              <Link
                key={t}
                href={toggleTagHref(t)}
                className={
                  "text-xs px-2.5 py-1 rounded-full border transition-colors " +
                  (selected
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800")
                }
              >
                {t}
              </Link>
            )
          })}
        </div>
      </div>

      {activeView === "week" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
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
              <h2 className="truncate text-base font-medium text-gray-900 dark:text-zinc-100 sm:text-lg">
                {weekLabel}
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
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
              const practice = practicesByDay.get(key)?.[0]
              const weekday = WEEKDAYS[date.getUTCDay()]
              return (
                <div
                  key={key}
                  className="min-h-16 rounded-xl border bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {renderPracticeCell({
                    dayKey: key,
                    dayLabel: `${weekday} ${date.getUTCDate()}`,
                    practice,
                    tall: true,
                  })}
                </div>
              )
            })}
          </div>

          {/* Desktop: 7-column week grid */}
          <div className="hidden overflow-hidden rounded-xl border bg-white dark:border-zinc-700 dark:bg-zinc-900 md:block">
            <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="px-2 py-2">
                  {weekday}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {weekDays.map((date) => {
                const key = dayKey(date)
                const practice = practicesByDay.get(key)?.[0]
                return (
                  <div
                    key={key}
                    className="flex min-h-52 flex-col border-b border-r p-1.5 last:border-r-0 dark:border-zinc-800"
                  >
                    {renderPracticeCell({
                      dayKey: key,
                      dayLabel: String(date.getUTCDate()),
                      practice,
                      tall: true,
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      ) : activeView === "month" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href={buildHref({
                  month: formatMonthParam(addUtcMonths(calendarMonth, -1)),
                })}
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
              <h2 className="truncate text-base font-medium text-gray-900 dark:text-zinc-100 sm:text-lg">
                {monthLabel}
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                {practices.length} practice{practices.length === 1 ? "" : "s"}
              </p>
            </div>
            <Link
              href={buildHref({
                month: formatMonthParam(addUtcMonths(calendarMonth, 1)),
              })}
              className={navButtonClass}
            >
              <span className="sm:hidden">→</span>
              <span className="hidden sm:inline">Next →</span>
            </Link>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
            <div className="min-w-[28rem] overflow-hidden rounded-xl border bg-white dark:border-zinc-700 dark:bg-zinc-900 md:min-w-0">
              <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
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
                  const practice = inMonth ? practicesByDay.get(key)?.[0] : undefined
                  return (
                    <div
                      key={key}
                      className="flex min-h-24 flex-col border-b border-r p-1 last:border-r-0 dark:border-zinc-800 sm:min-h-28 sm:p-1.5 md:min-h-36"
                    >
                      {inMonth ? (
                        renderPracticeCell({
                          dayKey: key,
                          dayLabel: String(date.getUTCDate()),
                          practice,
                        })
                      ) : (
                        <div className="px-1 text-xs font-medium text-gray-300 dark:text-zinc-600">
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
        <div className="border rounded-xl px-4 py-12 text-center text-sm text-gray-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
          {query || activeTags.length
            ? "No practices match your search."
            : isCoach
              ? "No practices yet. Create one to get started."
              : "No practices posted yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {practices.map((p) => {
            const tags = [...new Set(p.sets.flatMap((s) => s.tags))]
            const totalDistance = p.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
            const key = p.date ? dayKey(p.date) : ""
            return (
              <PracticeCardShell
                key={p.id}
                dayKey={key}
                href={practiceHref(p.id)}
                todayClassName="!border-indigo-500 dark:!border-indigo-400"
                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-gray-900 dark:text-zinc-100 truncate">
                      {p.title}
                    </p>
                    {isCoach && !p.published && (
                      <span className="text-[10px] uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    {p.date ? formatSwimDate(p.date) : "No date"}
                    {" · "}
                    {p._count.sets} set{p._count.sets === 1 ? "" : "s"}
                    {totalDistance > 0 ? ` · ${totalDistance.toLocaleString()} total` : ""}
                  </p>
                  {tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] uppercase tracking-wide rounded bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 text-gray-500 dark:text-zinc-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-gray-300 dark:text-zinc-600">→</span>
              </PracticeCardShell>
            )
          })}
        </div>
      )}
    </main>
  )
}
