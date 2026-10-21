import Link from "next/link"
import { AppIcon } from "@/components/ui/AppIcon"
import { Skeleton } from "@/components/ui/Skeleton"
import BalancedGrid from "@/components/ui/BalancedGrid"
import { relayLineupHasAthlete, relayLineupRoundLabel, type RelayLineup } from "@swimbuzz/shared"
import { formatLegTime, type LineupTeam } from "@/lib/meet/relay-builder"

export type RelaySummaryCard = {
  key: string
  title: string
  total: string
  /** Not published yet (a draft or a suggestion) — dashed and muted. */
  dashed: boolean
  /** The viewing athlete swims on this relay. */
  mine: boolean
  legs: { key: string; name: string; me: boolean }[]
}

export type RelaySummaryPill = { label: string; tone: "published" | "draft" | "suggested" }

export type RelaySummaryEvent = {
  slug: string
  /** "Women 200 Medley". */
  name: string
  /** Opens the builder for this event (staff only). */
  href?: string
  pills: RelaySummaryPill[]
  state: "cards" | "loading" | "empty"
  /** Shown in place of cards when `state` is "empty". */
  emptyText?: string
  cards: RelaySummaryCard[]
}

const PILL_TONES: Record<RelaySummaryPill["tone"], string> = {
  published: "border-primary/30 bg-primary/10 text-accent",
  draft: "border-border text-foreground-secondary",
  suggested: "border-dashed border-border text-foreground-secondary",
}

function EventHeader({ event }: { event: RelaySummaryEvent }) {
  const content = (
    <>
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{event.name}</span>
        {event.pills.map((pill) => (
          <span
            key={pill.label}
            className={`shrink-0 rounded-full border px-2 py-px text-[11px] font-medium ${PILL_TONES[pill.tone]}`}
          >
            {pill.label}
          </span>
        ))}
      </span>
      {event.href ? (
        <AppIcon
          name="chevronRight"
          className="h-4 w-4 shrink-0 text-foreground-tertiary transition-colors group-hover:text-foreground"
        />
      ) : null}
    </>
  )
  const className =
    "-mx-2 flex min-h-8 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 py-1 text-left"
  if (!event.href) return <div className={className}>{content}</div>
  return (
    <Link
      href={event.href}
      aria-label={`${event.pills.some((p) => p.tone === "published") ? "Edit" : "Build"} ${event.name} Relay`}
      className={`group ${className} transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35`}
    >
      {content}
    </Link>
  )
}

function SummaryCard({ card }: { card: RelaySummaryCard }) {
  return (
    <div
      className={
        "min-w-0 rounded-lg border " +
        (card.dashed
          ? "border-dashed border-border bg-transparent"
          : card.mine
            ? "border-primary bg-background ring-1 ring-primary"
            : "border-border bg-background")
      }
    >
      <div
        className={
          "flex items-baseline justify-between gap-2 border-b border-border px-3 py-[7px] text-sm font-medium " +
          (card.dashed ? "text-foreground-secondary" : "text-foreground")
        }
      >
        <span className="truncate">{card.title}</span>
        <span className="shrink-0 font-mono tabular-nums">{card.total}</span>
      </div>
      <ol>
        {card.legs.map((leg) => (
          <li
            key={leg.key}
            className="flex items-center border-t border-border px-3 py-[5px] text-sm first:border-t-0"
          >
            <span
              className={
                "min-w-0 truncate " +
                (leg.me
                  ? "font-semibold text-accent"
                  : card.dashed
                    ? "text-foreground-secondary"
                    : "font-medium text-foreground")
              }
            >
              {leg.name}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function RelaySummaryCardSkeleton() {
  return (
    <div className="rounded-lg border border-dashed border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-12" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="border-t border-border px-3 py-2 first:border-t-0">
          <Skeleton className="h-3.5 w-28" />
        </div>
      ))}
    </div>
  )
}

/** Every relay event at a glance: published lineups solid, drafts and suggestions dashed. */
export default function RelaySummary({ events }: { events: RelaySummaryEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-secondary">
        No relays published yet.
      </p>
    )
  }
  return (
    <BalancedGrid count={events.length} minColumnPx={240} gapXPx={16} className="items-start gap-x-4 gap-y-5">
      {events.map((event) => (
        <section key={event.slug} className="flex min-w-0 flex-col gap-2" aria-label={`${event.name} Relay`}>
          <EventHeader event={event} />
          {event.state === "loading" ? (
            <>
              <RelaySummaryCardSkeleton />
              <RelaySummaryCardSkeleton />
            </>
          ) : event.state === "empty" ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-3 py-3.5">
              <p className="text-sm text-foreground-secondary">{event.emptyText}</p>
              {event.href ? (
                <Link href={event.href} className="text-[13px] text-accent hover:underline">
                  Build lineup
                </Link>
              ) : null}
            </div>
          ) : (
            event.cards.map((card) => <SummaryCard key={card.key} card={card} />)
          )}
        </section>
      ))}
    </BalancedGrid>
  )
}

/** Summary cards for published relays (one per team and round). */
export function publishedSummaryCards(
  lineups: RelayLineup[],
  viewerAthleteId: string | null
): RelaySummaryCard[] {
  return lineups.map((relay) => {
    const round = relayLineupRoundLabel(relay.round)
    return {
      key: relay.key,
      title: `${relay.letter} Relay${round ? ` · ${round}` : ""}`,
      total: relay.resultTime ?? relay.seedTime ?? "—",
      dashed: false,
      mine: relayLineupHasAthlete(relay, viewerAthleteId),
      legs: relay.legs.map((leg) => ({
        key: String(leg.leg),
        name: leg.name,
        me: Boolean(viewerAthleteId) && leg.athleteId === viewerAthleteId,
      })),
    }
  })
}

/** Dashed summary cards for an unpublished lineup (a draft or a suggestion). */
export function lineupSummaryCards(slug: string, teams: LineupTeam[]): RelaySummaryCard[] {
  return teams.map((team) => {
    const times = team.legs.map((leg) => leg.timeMs ?? null)
    const total = times.every((t) => t != null)
      ? (times as number[]).reduce((sum, t) => sum + t, 0)
      : null
    return {
      key: `${slug}-${team.letter}`,
      title: `${team.letter} Relay`,
      total: formatLegTime(total),
      dashed: true,
      mine: false,
      legs: team.legs.map((leg, i) => ({ key: String(i), name: leg.name, me: false })),
    }
  })
}
