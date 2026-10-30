import Link from "next/link"
import { AppIcon } from "@/components/ui/AppIcon"
import { Skeleton } from "@/components/ui/Skeleton"
import BalancedGrid from "@/components/ui/BalancedGrid"
import {
  relayLineupHasAthlete,
  relayLineupRoundLabel,
  relayShareRows,
  type RelayLineup,
} from "@swimbuzz/shared"
import { formatLegTime, type LineupTeam } from "@/lib/meet/relay-builder"
import { EventBadge } from "../SummaryRow"

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
  /** Meet event number, when the event order has one. */
  number?: number | null
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

/** Cards inside a hovered event block take the block's hover color, so it reads as one surface. */
const groupHover = "transition-colors group-hover:bg-background-hover-strong"

export function EventHeader({ event }: { event: RelaySummaryEvent }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2 py-1 text-left">
      <span className="inline-flex min-w-0 items-center gap-2">
        {event.number ? <EventBadge number={event.number} compact /> : null}
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
    </div>
  )
}

export function SummaryCard({ card, clickable }: { card: RelaySummaryCard; clickable: boolean }) {
  return (
    <div
      className={
        "min-w-0 rounded-lg border " +
        (clickable ? `${groupHover} ` : "") +
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
                  ? "font-medium text-accent"
                  : card.dashed
                    ? "text-foreground-secondary"
                    : "text-foreground")
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

/**
 * Narrowest column that still shows every event header and swimmer name in full, from approximate
 * glyph widths (14px names, 11px pills) — same idea as the design prototype.
 */
function minColumnWidth(events: RelaySummaryEvent[]): number {
  let width = 0
  for (const event of events) {
    const pills = event.pills.reduce((sum, pill) => sum + pill.label.length * 6.6 + 26, 0)
    // number badge + name + pills (padding, border, gap) + chevron and its gap + header padding
    const badge = event.number ? 28 : 0
    width = Math.max(width, badge + event.name.length * 7.9 + pills + (event.href ? 24 : 0) + 16)
    for (const card of event.cards) {
      // card header: title + mono total + gap and padding
      width = Math.max(width, card.title.length * 7.9 + card.total.length * 8.4 + 32)
      for (const leg of card.legs) width = Math.max(width, leg.name.length * 8.2 + 26)
    }
  }
  return Math.ceil(Math.min(260, Math.max(160, width)))
}

/** Every relay event at a glance: published lineups solid, drafts and suggestions dashed. */
export default function RelaySummary({
  events,
  onOpen,
}: {
  events: RelaySummaryEvent[]
  /** Opens an event's builder without a server round trip (plain clicks only). */
  onOpen?: (slug: string) => void
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-secondary">
        No relays published yet.
      </p>
    )
  }
  // Past a few events: women's row, then men's (mixed at its end), event types in shared columns.
  const rows = relayShareRows(events)
  return (
    <BalancedGrid
      count={events.length}
      minColumnPx={minColumnWidth(events)}
      gapXPx={16}
      alignedColumns={rows.length > 1 ? rows[0].length : undefined}
      className="items-start gap-x-4 gap-y-5"
    >
      {rows.flat().map((event, i) => {
        // Blank cell keeping the other gender's event in its column; hidden when the grid wraps.
        if (!event) {
          return (
            <div
              key={`blank-${i}`}
              data-placeholder
              aria-hidden
              className="hidden group-data-[aligned=true]/rows:block"
            />
          )
        }
        const content = (
          <>
            <EventHeader event={event} />
            {event.state === "loading" ? (
              <>
                <RelaySummaryCardSkeleton />
                <RelaySummaryCardSkeleton />
              </>
            ) : event.state === "empty" ? (
              <div
                className={
                  "flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-3 py-3.5 " +
                  (event.href ? groupHover : "")
                }
              >
                <p className="text-sm text-foreground-secondary">{event.emptyText}</p>
                {event.href ? (
                  <span className="text-[13px] text-accent group-hover:underline">Build lineup</span>
                ) : null}
              </div>
            ) : (
              event.cards.map((card) => (
                <SummaryCard key={card.key} card={card} clickable={Boolean(event.href)} />
              ))
            )}
          </>
        )
        return (
          <section key={event.slug} className="min-w-0" aria-label={`${event.name} Relay`}>
            {event.href ? (
              // The whole block — header and relay cards — opens the builder.
              <Link
                href={event.href}
                onClick={(e) => {
                  if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                  e.preventDefault()
                  onOpen(event.slug)
                }}
                aria-label={`${event.pills.some((p) => p.tone === "published") ? "Edit" : "Build"} ${event.name} Relay`}
                // Padded out into the grid gap so the hover fills the header, cards and gaps as one card.
                className="group -m-2 flex flex-col gap-2 rounded-xl p-2 transition-colors hover:bg-background-hover-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35"
              >
                {content}
              </Link>
            ) : (
              <div className="flex flex-col gap-2">{content}</div>
            )}
          </section>
        )
      })}
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
