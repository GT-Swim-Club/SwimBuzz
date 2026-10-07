"use client"

import Link from "next/link"
import { formatMeetDateRange, zonedDayKey } from "@swimbuzz/shared"
import { RelativeDateRange, useTodayKey } from "@/components/ui/RelativeDate"
import MeetGalleryCard, { MeetCardRows } from "./MeetGalleryCard"
import EditMeetButton from "./EditMeetButton"
import { type MeetFormState } from "./MeetFields"
import { meetPath } from "@/lib/slug"
import MeetCountdown from "@/components/meet/MeetCountdown"
import { toDateInput, toTimeInput } from "@/lib/date-input"
import { useMeetsFilters } from "./use-meets-filters"

export type MeetListItem = {
  id: string
  slug: string | null
  name: string
  location: string | null
  school: string | null
  startsAt: Date
  endsAt: Date | null
  hasStartTime: boolean
  timeZone: string
  course: MeetFormState["course"]
  season: string
  iconUrl: string | null
  bannerUrl: string | null
  packetUrl: string | null
  psychSheetUrl: string | null
  heatSheetUrl: string | null
  resultsUrl: string | null
  /** Still upcoming or in progress (its last day hasn't passed in the meet's zone). */
  upcoming: boolean
  /** Has a signup form whose window is currently open. */
  signupOpen: boolean
  /** The viewer's athlete swam in or signed up for this meet. */
  mine: boolean
}

function meetFormInitial(m: MeetListItem): MeetFormState {
  return {
    name: m.name,
    location: m.location ?? "",
    startDate: toDateInput(m.startsAt, m.timeZone),
    startTime: m.hasStartTime ? toTimeInput(m.startsAt, m.timeZone) : "",
    timeZone: m.timeZone,
    endDate: toDateInput(m.endsAt, m.timeZone),
    course: m.course,
    season: m.season,
    school: m.school ?? "",
    iconUrl: m.iconUrl ?? "",
    bannerUrl: m.bannerUrl ?? "",
    packetUrl: m.packetUrl ?? "",
    psychSheetUrl: m.psychSheetUrl ?? "",
    heatSheetUrl: m.heatSheetUrl ?? "",
    resultsUrl: m.resultsUrl ?? "",
  }
}

function dayDiff(dayKey: string, todayKey: string) {
  return Math.round(
    (new Date(`${dayKey}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / 86_400_000
  )
}

function relativeAhead(days: number) {
  if (days <= 0) return "today"
  if (days === 1) return "tomorrow"
  if (days < 14) return `in ${days} days`
  return `in ${Math.round(days / 7)} weeks`
}

function relativeAgo(days: number) {
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  const months = Math.round(days / 30.4)
  if (months < 12) return `${months} months ago`
  const years = Math.round(months / 12)
  return years === 1 ? "last year" : `${years} years ago`
}

/** "Upcoming · in 10 days" / "Last meet · 2 weeks ago" — relative part is client-only (viewer's day). */
function CardEyebrow({ meet, past }: { meet: MeetListItem; past: boolean }) {
  const todayKey = useTodayKey()
  const days = todayKey ? dayDiff(zonedDayKey(meet.startsAt, meet.timeZone), todayKey) : null
  const label = past ? "Last meet" : "Upcoming"
  const relative = days === null ? null : past ? relativeAgo(-days) : relativeAhead(days)
  return (
    <div
      className={`text-[length:clamp(11px,9px+0.15cqw+0.08vw,15px)] font-semibold uppercase tracking-[0.16em] ${past ? "text-white/85" : "text-accent"}`}
    >
      {relative ? `${label} · ${relative}` : label}
    </div>
  )
}

type CardKind = "upcoming" | "past" | "last"

const sectionHeadingClass = "text-sm font-medium uppercase tracking-wide text-foreground-secondary"
const editOnImageClass =
  "flex h-[2.57em] w-[2.57em] items-center justify-center rounded-[0.57em] border border-white/30 text-white transition-colors hover:bg-white/12"
/** Action icons are sized in `em` off the card's scaling action font size. */
const actionIconClass = "h-[1.15em] w-[1.15em]"

export default function MeetsClientWrapper({
  meets,
  seasonOptions,
  isCoach,
  query,
  canScope,
}: {
  meets: MeetListItem[]
  seasonOptions: string[]
  isCoach: boolean
  query: string
  /** Whether the viewer has a linked athlete, i.e. "My meets" means something. */
  canScope: boolean
}) {
  const filters = useMeetsFilters()
  const season = filters.season
  const scope = canScope ? filters.scope : "all"
  const pool = scope === "mine" ? meets.filter((m) => m.mine) : meets
  const upcoming = pool.filter((m) => m.upcoming).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
  const past = pool.filter((m) => !m.upcoming).sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))

  const inSeason = (m: MeetListItem) => !season || m.season === season

  // With nothing upcoming, the most recent meet gets its own "Last meet"
  // section (unless searching) and drops out of the past list below.
  const lastMeet = !query && upcoming.length === 0 ? past[0] : undefined
  const sections: { label: string; kind: CardKind; items: MeetListItem[] }[] = [
    { label: "Last meet", kind: "last" as const, items: lastMeet ? [lastMeet] : [] },
    { label: "Upcoming meets", kind: "upcoming" as const, items: upcoming.filter(inSeason) },
    { label: "Past meets", kind: "past" as const, items: past.filter((m) => m !== lastMeet && inSeason(m)) },
  ].filter((s) => s.items.length > 0)

  function renderCard(m: MeetListItem, kind: CardKind, rowSize: number) {
    const href = meetPath(m.slug ?? m.id)
    const dateText = formatMeetDateRange(m.startsAt, m.endsAt, m.timeZone)
    return (
      <MeetGalleryCard
        name={m.name}
        href={href}
        bannerUrl={m.bannerUrl}
        iconUrl={m.iconUrl}
        eyebrow={kind !== "past" ? <CardEyebrow meet={m} past={kind === "last"} /> : undefined}
        dateLine={
          kind === "upcoming" ? (
            dateText.replace(/, \d{4}$/, "")
          ) : kind === "last" ? (
            dateText
          ) : (
            <RelativeDateRange startsAt={m.startsAt} endsAt={m.endsAt} timeZone={m.timeZone} />
          )
        }
        location={[m.location, m.school].filter(Boolean).join(" · ")}
        stackMeta={rowSize >= 3}
        badge={kind === "upcoming" && m.hasStartTime ? <MeetCountdown startsAt={m.startsAt} variant="glass" /> : null}
        actions={
          <>
            {isCoach && (
              <EditMeetButton
                meetId={m.id}
                initial={meetFormInitial(m)}
                seasons={seasonOptions}
                className={editOnImageClass}
                iconClassName={actionIconClass}
              />
            )}
            {kind === "upcoming" && m.signupOpen && (
              <Link
                href={`${href}/signup`}
                className="inline-flex h-[2.57em] items-center whitespace-nowrap rounded-[0.57em] bg-primary px-[1.14em] text-[1em] font-medium text-primary-text transition-colors [text-shadow:none] hover:bg-primary-hover"
              >
                Sign up
              </Link>
            )}
          </>
        }
      />
    )
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background px-4 py-12 text-center text-sm text-foreground-secondary">
        {query
          ? "No meets match your search."
          : season || scope === "mine"
            ? "No meets match these filters."
            : `No meets yet.${isCoach ? " Create one to start tracking results." : ""}`}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => (
        <section key={s.label} className="flex flex-col gap-3">
          <h2 className={sectionHeadingClass}>{s.label}</h2>
          <MeetCardRows items={s.items} renderCard={(m, rowSize) => renderCard(m, s.kind, rowSize)} />
        </section>
      ))}
    </div>
  )
}
