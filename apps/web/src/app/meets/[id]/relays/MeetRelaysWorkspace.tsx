"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  DEFAULT_RELAY_COUNT,
  buildAthleteIds,
  fetchOptimalRelay,
  initialLineup,
  lineupTeamsOf,
  poolAthletesFor,
  type AthleteOption,
  type RelayResult,
  type RelaySlotData,
} from "@/lib/meet/relay-builder"
import MeetRelayBuilder from "../MeetRelayBuilder"
import RelayPageHeader, { relayEyebrowClass } from "./RelayPageHeader"
import RelaySummary, {
  lineupSummaryCards,
  publishedSummaryCards,
  type RelaySummaryEvent,
} from "./RelaySummary"

/**
 * Optimal result at the builder's default settings, per relay event. For an event with nothing
 * saved it's the summary's suggestion; for drafts and published lineups it supplies the stroke
 * times and alternates the builder re-times them with — so opening any event is instant.
 */
type Build = { status: "ok"; result: RelayResult } | { status: "error"; error: string }

/** Staff relays page: the summary of every relay event, or the builder for one (`?event=`). */
export default function MeetRelaysWorkspace({
  meetId,
  meetName,
  relaysPath,
  iconUrl,
  course,
  slots,
  selectedSlug,
  athletes,
  signupRelayPrefs,
  hasImportedResults,
  viewerAthleteId,
  backLink,
}: {
  meetId: string
  meetName: string
  relaysPath: string
  iconUrl: string | null
  course: string
  slots: RelaySlotData[]
  selectedSlug: string | null
  athletes: AthleteOption[]
  /** Relay preferences by athlete id from the last sign-up import; null when none. */
  signupRelayPrefs: Record<string, string[]> | null
  hasImportedResults: boolean
  viewerAthleteId: string | null
  backLink: ReactNode
}) {
  // Kept across builder visits so neither the summary nor the builder re-runs the solver.
  const [builds, setBuilds] = useState<Record<string, Build>>({})
  const requested = useRef(new Set<string>())
  const hasSignups = signupRelayPrefs != null && Object.keys(signupRelayPrefs).length > 0
  const pools = useMemo(
    () =>
      new Map(
        slots.map(({ slot }) => [
          slot.slug,
          poolAthletesFor(athletes, slot.gender, slot.event, hasSignups ? "relay" : "all", signupRelayPrefs),
        ])
      ),
    [slots, athletes, hasSignups, signupRelayPrefs]
  )

  useEffect(() => {
    if (selectedSlug) return
    const pending = slots
      .filter(({ slot }) => !requested.current.has(slot.slug))
      .map((data) => ({ data, fixed: initialLineup(data).fixed }))
      .filter(({ data, fixed }) => fixed || (pools.get(data.slot.slug) ?? []).length > 0)
    if (pending.length === 0) return
    for (const { data } of pending) requested.current.add(data.slot.slug)

    const run = (batch: typeof pending) => {
      if (batch.length === 0) return
      void Promise.all(
        batch.map(async ({ data: { slot }, fixed }): Promise<[string, Build]> => {
          try {
            const res = await fetchOptimalRelay({
              meetId,
              event: slot.event,
              course,
              gender: slot.gender,
              relayCount: fixed ? fixed.length : DEFAULT_RELAY_COUNT,
              athleteIds: buildAthleteIds(pools.get(slot.slug) ?? [], hasSignups, fixed),
            })
            return [
              slot.slug,
              res.ok && (fixed || res.result.teams.length > 0)
                ? { status: "ok", result: res.result }
                : { status: "error", error: res.ok ? "Not enough swimmers with times." : res.error },
            ]
          } catch {
            return [slot.slug, { status: "error", error: "Couldn't build a suggestion." }]
          }
        })
      ).then((entries) => setBuilds((prev) => ({ ...prev, ...Object.fromEntries(entries) })))
    }
    // Suggestions show together as one batch; drafts and published lineups are already on
    // screen, so their builds are fetched separately and never hold the suggestions up.
    run(pending.filter(({ fixed }) => !fixed))
    run(pending.filter(({ fixed }) => fixed))
  }, [selectedSlug, slots, pools, course, hasSignups, meetId])

  const selected = selectedSlug ? slots.find((d) => d.slot.slug === selectedSlug) : null
  if (selected) {
    return (
      <MeetRelayBuilder
        key={selected.slot.slug}
        meetId={meetId}
        meetName={meetName}
        iconUrl={iconUrl}
        relaysPath={relaysPath}
        course={course}
        data={selected}
        initialBase={(() => {
          const build = builds[selected.slot.slug]
          return build?.status === "ok" ? build.result : null
        })()}
        slots={slots.map((d) => d.slot)}
        athletes={athletes}
        signupRelayPrefs={signupRelayPrefs}
        hasImportedResults={hasImportedResults}
      />
    )
  }

  const events: RelaySummaryEvent[] = slots.map(({ slot, published, draft }) => {
    const base = {
      slug: slot.slug,
      name: slot.label.replace(/ Relay$/, ""),
      href: `${relaysPath}?event=${encodeURIComponent(slot.slug)}`,
    }
    // One status per event: a draft (saving one unpublishes the event), else what's published.
    if (draft) {
      return {
        ...base,
        pills: [{ label: "Draft", tone: "draft" as const }],
        state: "cards" as const,
        cards: lineupSummaryCards(slot.slug, draft.teams),
      }
    }
    if (published.length > 0) {
      return {
        ...base,
        pills: [{ label: "Published", tone: "published" as const }],
        state: "cards" as const,
        cards: publishedSummaryCards(published, viewerAthleteId),
      }
    }
    const suggestion: Build | undefined =
      (pools.get(slot.slug) ?? []).length === 0
        ? {
            status: "error",
            error: hasSignups ? "No swimmers signed up for this relay." : "No swimmers in the pool.",
          }
        : builds[slot.slug]
    if (suggestion?.status === "ok") {
      return {
        ...base,
        pills: [{ label: "Auto", tone: "suggested" as const }],
        state: "cards" as const,
        cards: lineupSummaryCards(slot.slug, lineupTeamsOf(suggestion.result)),
      }
    }
    return {
      ...base,
      pills: [{ label: "Auto", tone: "suggested" as const }],
      state: suggestion?.status === "error" ? ("empty" as const) : ("loading" as const),
      emptyText: suggestion?.status === "error" ? suggestion.error : undefined,
      cards: [],
    }
  })

  return (
    <main className="w-full flex flex-col gap-6 py-2 sm:py-4">
      <RelayPageHeader
        meetName={meetName}
        iconUrl={iconUrl}
        back={backLink}
        eyebrow={<p className={relayEyebrowClass}>Relays</p>}
      />
      <RelaySummary events={events} />
    </main>
  )
}
