"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { MeetHeaderDetails } from "@swimbuzz/shared"
import {
  DEFAULT_RELAY_COUNT,
  buildAthleteIds,
  fetchOptimalRelay,
  initialLineup,
  lineupTeamsOf,
  pendingDraft,
  poolAthletesFor,
  relayShareEvent,
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
  type RelaySummaryEvent,
} from "./RelaySummary"
import PublishAllRelaysButton from "./PublishAllRelaysButton"
import { planPublishAll } from "./publish-all"
import ShareRelaysButton from "./ShareRelaysButton"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import {
  RELAY_EDIT_LOCK_HEARTBEAT_MS,
  RELAY_EDIT_LOCK_POLL_MS,
  RELAY_EDIT_LOCK_TOKEN_HEADER,
  relayEditLockHolderName,
  type RelayEditLockInfo,
} from "@/lib/meet/relay-edit-lock-shared"

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
 *
 * Like practices, one session at a time edits a relay event: this tab claims an event's edit lock
 * before showing its builder, renews it while open, and releases it on leaving (after any save).
 */
export default function MeetRelaysWorkspace({
  meetId,
  meetName,
  details,
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
  /** Date and location for the share PNG's header. */
  details: MeetHeaderDetails
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

  function saveTarget(data: RelaySlotData, relayEvent: string, lockToken?: string | null) {
    const { slot } = data
    return { meetId, event: slot.event, relayEvent, gender: slot.gender, published: data.published, lockToken }
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
    report = true,
    lockToken?: string | null
  ): Promise<string | null> {
    const { slot } = data
    const target = saveTarget(data, relayEvent, lockToken)
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

  // --- Edit locks ---------------------------------------------------------------------------
  const lockUrl = `/api/meets/${encodeURIComponent(meetId)}/relays/lock`
  /**
   * This tab's lock on the event whose builder is open. The builder opens at once while the lock is
   * claimed (`token` null until it lands), so opening an event doesn't wait on the server.
   */
  const [held, setHeldState] = useState<{ slug: string; token: string | null } | null>(null)
  const heldRef = useRef(held)
  /** Kept in step with the ref, which async handlers read before the next render. */
  function setHeld(next: { slug: string; token: string | null } | null) {
    heldRef.current = next
    setHeldState(next)
  }
  /** Someone else is editing the event this tab tried to open: offer to take over. */
  const [takeover, setTakeover] = useState<{ slug: string; lock: RelayEditLockInfo } | null>(null)
  const [takingOver, setTakingOver] = useState(false)
  const [takeoverError, setTakeoverError] = useState<string | null>(null)
  /** Who asked to take over the event this tab is editing; the builder then saves and leaves. */
  const [takeoverBy, setTakeoverBy] = useState<string | null>(null)
  /** Who is editing which event, for the summary's pills and Publish all. */
  const [locks, setLocks] = useState<RelayEditLockInfo[]>([])
  /** Why the builder closed on its own (taken over, idle, lock lost). */
  const [notice, setNotice] = useState<string | null>(null)

  const slotLabel = (slug: string) => slots.find((d) => d.slot.slug === slug)?.slot.label ?? "this relay"

  /**
   * Events whose lock this tab still has but is giving up (a save landing, then the release). The
   * lock list still shows them as ours meanwhile — not "Open in another tab".
   */
  const [releasing, setReleasing] = useState<string[]>([])
  /** Bumped once a release lands, to refresh the lock list right away. */
  const [locksVersion, setLocksVersion] = useState(0)

  function markReleasing(slug: string) {
    setReleasing((current) => (current.includes(slug) ? current : [...current, slug]))
  }

  function releaseLock(lock: { slug: string; token: string | null }) {
    if (!lock.token) return
    markReleasing(lock.slug)
    void fetch(`${lockUrl}?slot=${encodeURIComponent(lock.slug)}`, {
      method: "DELETE",
      keepalive: true,
      headers: { [RELAY_EDIT_LOCK_TOKEN_HEADER]: lock.token },
    })
      .catch(() => undefined)
      .finally(() => {
        // Drop it from the list now rather than when the refetch lands, or it'd flash as another tab's.
        setLocks((current) => current.filter((held) => !(held.slot === lock.slug && held.lockedByMe)))
        setReleasing((current) => current.filter((slug) => slug !== lock.slug))
        setLocksVersion((version) => version + 1)
      })
  }

  /** Events this tab is claiming right now, so a double request can't trip over its own lock. */
  const acquiringRef = useRef(new Set<string>())

  /**
   * Show an event's builder and claim its lock. A plain open shows the builder at once and backs out
   * to the takeover dialog if someone else has it; a takeover waits for the lock first.
   */
  async function openEvent(slug: string, { replace = false, force = false } = {}) {
    const current = heldRef.current
    if (current?.slug === slug) {
      go(slug, replace)
      return
    }
    if (!force) {
      // Switching events from the builder: the previous one is free again.
      if (current) releaseLock(current)
      setHeld({ slug, token: null })
      setTakeover(null)
      setNotice(null)
      go(slug, replace)
    }
    // A claim already in flight (e.g. reopened right after leaving) lands on the builder shown above.
    if (acquiringRef.current.has(slug)) return
    acquiringRef.current.add(slug)
    if (force) {
      setTakingOver(true)
      setTakeoverError(null)
    }
    /** Back to the summary if this open is still the builder on screen. */
    const backOut = () => {
      if (force || heldRef.current?.slug !== slug || heldRef.current.token) return
      setHeld(null)
      go(null, true)
    }
    try {
      const res = await fetch(lockUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: slug, force }),
      })
      const body = (await res.json().catch(() => ({}))) as Partial<RelayEditLockInfo> & {
        error?: string
        lock?: RelayEditLockInfo
      }
      if (!res.ok || !body.token) {
        if (body.lock && !force) {
          backOut()
          setTakeover({ slug, lock: body.lock })
          return
        }
        throw new Error(body.error ?? "Couldn't open this relay")
      }
      if (force) {
        if (current) releaseLock(current)
        setHeld({ slug, token: body.token })
        setTakeover(null)
        setTakeoverBy(null)
        setNotice(null)
        go(slug, replace)
      } else if (heldRef.current?.slug === slug && !heldRef.current.token) {
        setHeld({ slug, token: body.token })
      } else {
        // Left the builder before the lock landed.
        releaseLock({ slug, token: body.token })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      if (force) setTakeoverError(message)
      else {
        backOut()
        setSaveError(message)
      }
    } finally {
      acquiringRef.current.delete(slug)
      if (force) setTakingOver(false)
    }
  }
  const openEventRef = useRef(openEvent)
  useEffect(() => {
    openEventRef.current = openEvent
  })

  /** Back to the summary from the builder, freeing the event. */
  function leave(replace: boolean) {
    const lock = heldRef.current
    if (lock) releaseLock(lock)
    setHeld(null)
    go(null, replace)
  }

  function commit(data: RelaySlotData, change: RelayCommit, replace: boolean) {
    // The save carries this tab's lock, which is released only once it lands.
    const lock = heldRef.current?.slug === data.slot.slug ? heldRef.current : null
    if (lock) markReleasing(lock.slug)
    setHeld(null)
    show(data, change)
    void persist(data, change, true, lock?.token).finally(() => {
      if (lock) releaseLock(lock)
    })
    go(null, replace)
  }

  /** The builder's session ended on its own: save its unsaved changes as a draft, then say why. */
  function endSession(
    data: RelaySlotData,
    reason: "takeover" | "idle",
    draft: RelayCommit | null,
    replace: boolean
  ) {
    const { label } = data.slot
    const saved = draft ? " Your changes were saved as a draft." : ""
    setNotice(
      reason === "takeover"
        ? `${takeoverBy ?? "Another coach"} took over editing ${label}.${saved}`
        : `Your edit session for ${label} ended after 10 minutes without changes.${saved}`
    )
    setTakeoverBy(null)
    if (draft) commit(data, draft, replace)
    else leave(replace)
  }

  // Opened by URL (a reload or a shared link): claim the event first. Back/Forward does the same,
  // and leaving the builder with Back frees its event.
  useEffect(() => {
    function sync() {
      const slug = new URLSearchParams(window.location.search).get("event")
      const lock = heldRef.current
      if (slug && lock?.slug !== slug) void openEventRef.current(slug, { replace: true })
      else if (!slug && lock) {
        releaseLock(lock)
        setHeld(null)
      }
    }
    sync()
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While editing: renew the lock, and hand over when someone takes over or the lock is lost.
  useEffect(() => {
    if (!held?.token) return
    const lock = { slug: held.slug, token: held.token }
    async function beat() {
      const res = await fetch(lockUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: lock.slug, token: lock.token }),
      })
      const body = (await res.json().catch(() => ({}))) as Partial<RelayEditLockInfo> & {
        error?: string
        lock?: RelayEditLockInfo
      }
      if (heldRef.current?.token !== lock.token) return
      if (res.ok) {
        if (body.yieldRequested) setTakeoverBy(relayEditLockHolderName({ lockedBy: body.yieldRequestedBy ?? null }))
        return
      }
      if (res.status !== 409) return
      // Lost without a chance to save (it expired, or a takeover didn't wait for us).
      setHeld(null)
      go(null, true)
      setNotice(
        body.lock?.locked
          ? `${body.lock.lockedByMe ? "Another one of your tabs" : relayEditLockHolderName(body.lock)} took over editing ${slotLabel(lock.slug)}. Your unsaved changes weren't saved.`
          : `Your edit session for ${slotLabel(lock.slug)} expired. Your unsaved changes weren't saved.`
      )
    }
    const timer = window.setInterval(() => void beat().catch(() => undefined), RELAY_EDIT_LOCK_HEARTBEAT_MS)
    const onPageHide = () => releaseLock(lock)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("pagehide", onPageHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held?.slug, held?.token])

  // Leaving the page another way (a nav link) frees the event. Deferred so React Strict Mode's
  // remount in development doesn't drop the lock.
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const lock = heldRef.current
      window.setTimeout(() => {
        if (!mountedRef.current && lock) releaseLock(lock)
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On the summary: who is editing which event. Re-run when a release lands, which also drops any
  // poll still in flight from before it.
  useEffect(() => {
    if (selectedSlug) return
    let cancelled = false
    async function load() {
      if (document.hidden) return
      const res = await fetch(lockUrl)
      if (!res.ok) return
      const body = (await res.json().catch(() => ({}))) as { locks?: RelayEditLockInfo[] }
      if (!cancelled) setLocks(body.locks ?? [])
    }
    void load().catch(() => undefined)
    const timer = window.setInterval(() => void load().catch(() => undefined), RELAY_EDIT_LOCK_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [selectedSlug, lockUrl, locksVersion])

  /** Another session's lock on an event — not this tab's own, still releasing after a save. */
  const editorOf = (slug: string) =>
    locks.find(
      (lock) => lock.slot === slug && !(lock.lockedByMe && (releasing.includes(slug) || saving.includes(slug)))
    ) ?? null

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

  const takeoverModal = (
  <Modal
    open={takeover != null}
    onClose={() => setTakeover(null)}
    closeDisabled={takingOver}
    title="Relay is being edited"
    maxWidth="sm"
    footer={
      <ModalFooter>
        <button
          type="button"
          onClick={() => setTakeover(null)}
          disabled={takingOver}
          className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => takeover && void openEvent(takeover.slug, { force: true })}
          disabled={takingOver}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
        >
          {takingOver ? "Saving their changes…" : "Take over"}
        </button>
      </ModalFooter>
    }
  >
    {takeover ? (
      <p className="text-sm text-foreground-secondary">
        {takeover.lock.lockedByMe ? (
          <>
            You already have <span className="font-medium text-foreground">{slotLabel(takeover.slug)}</span>{" "}
            open in another tab. Taking over saves any changes there as a draft first.
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">{relayEditLockHolderName(takeover.lock)}</span> is
            editing <span className="font-medium text-foreground">{slotLabel(takeover.slug)}</span>. Taking over
            saves their unsaved changes as a draft first.
          </>
        )}
        {slots.find((d) => d.slot.slug === takeover.slug)?.published.some((relay) => relay.manual)
          ? " Saving a draft unpublishes this relay until it's published again."
          : null}
      </p>
    ) : null}
    {takeoverError ? <p className="mt-3 text-sm text-error">{takeoverError}</p> : null}
  </Modal>
  )

  // The builder shows only once this tab holds the event's lock.
  const selected =
    selectedSlug && held?.slug === selectedSlug ? slots.find((d) => d.slot.slug === selectedSlug) : null
  if (selected) {
    return (
      <>
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
          onExit={(slug, replace) => (slug ? void openEvent(slug, { replace }) : leave(replace))}
          takeoverRequested={takeoverBy != null}
          locked={held?.token != null}
          onSessionEnd={(reason, draft, replace) => endSession(selected, reason, draft, replace)}
        />
        {takeoverModal}
      </>
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
    // While saving, the status pill itself reads "Saving…" / "Publishing…".
    const isSaving = saving.includes(slot.slug)
    // One status per event: a draft (saving one unpublishes the event), else what's published.
    if (draft) {
      // A draft reads "Optimal" rather than "Draft" from the flag saved with it.
      const isOptimal = draft.optimal === true
      return {
        ...base,
        pills: [
          isSaving
            ? { label: "Saving…", tone: isOptimal ? ("suggested" as const) : ("draft" as const) }
            : isOptimal
              ? { label: "Optimal", tone: "suggested" as const }
              : { label: "Draft", tone: "draft" as const },
        ],
        state: "cards" as const,
        cards: lineupSummaryCards(slot.slug, draft.teams),
      }
    }
    if (published.length > 0) {
      return {
        ...base,
        pills: [
          { label: isSaving ? "Publishing…" : "Published", tone: "published" as const },
        ],
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

  const editingEvents = events.map((event) => {
    const editor = editorOf(event.slug)
    if (!editor) return event
    const label = editor.lockedByMe ? "Open in another tab" : `Editing: ${relayEditLockHolderName(editor)}`
    return { ...event, pills: [...event.pills, { label, tone: "editing" as const }] }
  })

  // Events someone is editing in the builder are theirs to publish.
  const fullPlan = planPublishAll(slots, (slug) => builds[slug], lineupTeamsOf)
  const publishAllPlan = {
    ...fullPlan,
    ready: fullPlan.ready.filter(({ data }) => !editorOf(data.slot.slug)),
    skipped: [
      ...fullPlan.skipped,
      ...fullPlan.ready.flatMap(({ data }) => {
        const editor = editorOf(data.slot.slug)
        if (!editor) return []
        const who = editor.lockedByMe ? "you're editing it in another tab" : `${relayEditLockHolderName(editor)} is editing it`
        return [{ label: data.slot.label, reason: who }]
      }),
    ],
  }

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
              <ShareRelaysButton meetId={meetId} meetName={meetName} details={details} iconUrl={iconUrl} events={shareEvents} />
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
      {notice ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-fill-secondary px-4 py-3 text-sm text-foreground"
        >
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <RelaySummary events={editingEvents} onOpen={(slug) => void openEvent(slug)} />
      {takeoverModal}
    </main>
  )
}
