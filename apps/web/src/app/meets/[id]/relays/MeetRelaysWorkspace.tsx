"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  DEFAULT_RELAY_COUNT,
  buildAthleteIds,
  fetchOptimalRelay,
  initialLineup,
  lineupTeamsOf,
  pendingDraft,
  poolAthletesFor,
  type AthleteOption,
  type RelayResult,
  type RelaySlotData,
} from "@/lib/meet/relay-builder"
import {
  optimisticPublished,
  persistRelayDraft,
  persistRelayPublish,
  type RelayCommit,
} from "@/lib/meet/relay-save"
import MeetRelayBuilder from "../MeetRelayBuilder"
import RelayPageHeader, { relayEyebrowClass } from "./RelayPageHeader"
import RelaySummary, {
  lineupSummaryCards,
  publishedSummaryCards,
  relayShareEvent,
  type RelaySummaryEvent,
} from "./RelaySummary"
import PublishAllRelaysButton from "./PublishAllRelaysButton"
import { planPublishAll } from "./publish-all"
import ShareRelaysButton from "./ShareRelaysButton"

/**
 * Optimal result at the builder's default settings, per relay event. For an event with nothing
 * saved it's the summary's suggestion; for drafts and published lineups it supplies the stroke
 * times and alternates the builder re-times them with — so opening any event is instant.
 */
type Build = { status: "ok"; result: RelayResult } | { status: "error"; error: string }

/**
 * Staff relays page: the summary of every relay event, or the builder for one (`?event=`).
 * Switching between them only changes the URL on the client, and a saved lineup shows on the
 * summary at once while it saves in the background — so leaving the builder is instant.
 */
export default function MeetRelaysWorkspace({
  meetId,
  meetName,
  relaysPath,
  iconUrl,
  course,
  slots: serverSlots,
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
  athletes: AthleteOption[]
  /** Relay preferences by athlete id from the last sign-up import; null when none. */
  signupRelayPrefs: Record<string, string[]> | null
  hasImportedResults: boolean
  viewerAthleteId: string | null
  backLink: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Lineups saved from the builder, shown until the server data catches up.
  const [overrides, setOverrides] = useState<Record<string, RelaySlotData>>({})
  const [saving, setSaving] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [seenSlots, setSeenSlots] = useState(serverSlots)
  if (seenSlots !== serverSlots) {
    // Fresh server data: drop overrides for saves that have landed.
    setSeenSlots(serverSlots)
    setOverrides((current) =>
      Object.fromEntries(Object.entries(current).filter(([slug]) => saving.includes(slug)))
    )
  }
  const slots = useMemo(
    () => serverSlots.map((data) => overrides[data.slot.slug] ?? data),
    [serverSlots, overrides]
  )
  const requestedSlug = searchParams.get("event")
  const selectedSlug =
    requestedSlug && slots.some((d) => d.slot.slug === requestedSlug) ? requestedSlug : null

  /** Show the summary (`slug` null) or an event's builder, without a server round trip. */
  function go(slug: string | null, replace: boolean) {
    const url = slug ? `${relaysPath}?event=${encodeURIComponent(slug)}` : relaysPath
    if (replace) window.history.replaceState(null, "", url)
    else window.history.pushState(null, "", url)
    document.getElementById("page-scroll")?.scrollTo({ top: 0 })
  }

  function saveTarget(data: RelaySlotData, relayEvent: string) {
    const { slot } = data
    return { meetId, event: slot.event, relayEvent, gender: slot.gender, published: data.published }
  }

  /** Show a saved lineup on the summary at once, before it persists. */
  function show(data: RelaySlotData, { kind, teams, relayEvent, optimal, settings }: RelayCommit) {
    const { slot } = data
    const savedAt = new Date().toISOString()
    setOverrides((current) => ({
      ...current,
      [slot.slug]:
        kind === "draft"
          ? {
              slot,
              published: data.published.filter((relay) => !relay.manual),
              draft: { teams, savedAt, optimal, settings },
            }
          : {
              slot,
              published: optimisticPublished(saveTarget(data, relayEvent), teams),
              draft: { teams, savedAt, settings, published: true },
            },
    }))
    setSaving((current) => [...current, slot.slug])
    setSaveError(null)
  }

  /** Persist a lineup `show` put on the summary; resolves to an error message, if any. */
  async function persist(
    data: RelaySlotData,
    { kind, teams, relayEvent, optimal, settings }: RelayCommit,
    report = true
  ): Promise<string | null> {
    const { slot } = data
    const target = saveTarget(data, relayEvent)
    try {
      if (kind === "draft") await persistRelayDraft(target, teams, optimal, settings)
      else await persistRelayPublish(target, teams, settings)
      return null
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      if (report) setSaveError(`${slot.label}: ${message}`)
      return message
    } finally {
      setSaving((current) => current.filter((slug) => slug !== slot.slug))
      router.refresh()
    }
  }

  function commit(data: RelaySlotData, change: RelayCommit, replace: boolean) {
    show(data, change)
    void persist(data, change)
    go(null, replace)
  }

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
                : { status: "error", error: res.ok ? "Not enough swimmers." : res.error },
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
        onCommit={(change, replace) => commit(selected, change, replace)}
        onExit={go}
      />
    )
  }

  const events: RelaySummaryEvent[] = slots.map((data) => {
    const { slot, published } = data
    const draft = pendingDraft(data)
    const base = {
      slug: slot.slug,
      name: slot.label.replace(/ Relay$/, ""),
      number: slot.number,
      href: `${relaysPath}?event=${encodeURIComponent(slot.slug)}`,
    }
    const savingPill = saving.includes(slot.slug) ? [{ label: "Saving…", tone: "suggested" as const }] : []
    // One status per event: a draft (saving one unpublishes the event), else what's published.
    if (draft) {
      // A draft reads "Optimal" rather than "Draft" from the flag saved with it.
      const isOptimal = draft.optimal === true
      return {
        ...base,
        pills: [
          isOptimal
            ? { label: "Optimal", tone: "suggested" as const }
            : { label: "Draft", tone: "draft" as const },
          ...savingPill,
        ],
        state: "cards" as const,
        cards: lineupSummaryCards(slot.slug, draft.teams),
      }
    }
    if (published.length > 0) {
      return {
        ...base,
        pills: [{ label: "Published", tone: "published" as const }, ...savingPill],
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
        pills: [{ label: "Optimal", tone: "suggested" as const }],
        state: "cards" as const,
        cards: lineupSummaryCards(slot.slug, lineupTeamsOf(suggestion.result)),
      }
    }
    return {
      ...base,
      pills: [{ label: "Optimal", tone: "suggested" as const }],
      state: suggestion?.status === "error" ? ("empty" as const) : ("loading" as const),
      emptyText: suggestion?.status === "error" ? suggestion.error : undefined,
      cards: [],
    }
  })

  const publishAllPlan = planPublishAll(slots, (slug) => builds[slug], lineupTeamsOf)

  async function publishAll() {
    const { ready, skipped } = publishAllPlan
    const commits = ready.map(({ data, teams, relayEvent }) => ({
      data,
      // A suggestion was built at the default settings; a draft keeps its own.
      change: { kind: "publish" as const, teams, relayEvent, settings: pendingDraft(data)?.settings },
    }))
    for (const { data, change } of commits) show(data, change)
    // One event at a time: each save rewrites the meet's relays and drafts, so parallel saves
    // would overwrite each other.
    const errors: (string | null)[] = []
    for (const { data, change } of commits) errors.push(await persist(data, change, false))
    const failed = ready.flatMap(({ data }, i) => (errors[i] ? [`${data.slot.label} (${errors[i]})`] : []))
    const published = ready.length - failed.length
    const problems = [
      ...failed,
      ...skipped.map((s) => `${s.label} (${s.reason})`),
    ]
    if (problems.length === 0) return
    setSaveError(
      `Published ${published} ${published === 1 ? "event" : "events"}. Couldn't publish: ${problems.join("; ")}.`
    )
  }

  // Share exports published lineups only — never drafts or suggestions.
  const shareEvents = slots
    .filter(({ published }) => published.length > 0)
    .map(({ slot, published }) => relayShareEvent(slot, published))

  return (
    <main className="w-full flex flex-col gap-6 py-2 sm:py-4">
      <RelayPageHeader
        meetName={meetName}
        iconUrl={iconUrl}
        back={backLink}
        eyebrow={<p className={relayEyebrowClass}>Relays</p>}
        actions={
          <>
            {!hasImportedResults && publishAllPlan.unpublished > 0 ? (
              <PublishAllRelaysButton
                plan={publishAllPlan}
                busy={saving.length > 0}
                onPublish={() => void publishAll()}
              />
            ) : null}
            {shareEvents.length > 0 ? (
              <ShareRelaysButton meetName={meetName} iconUrl={iconUrl} events={shareEvents} />
            ) : null}
          </>
        }
      />
      {saveError ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error"
        >
          <p>{saveError}</p>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="shrink-0 font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <RelaySummary events={events} onOpen={(slug) => go(slug, false)} />
    </main>
  )
}
