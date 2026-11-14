"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { MeetHeaderDetails } from "@swimbuzz/shared"
import {
  DEFAULT_RELAY_COUNT,
  buildAthleteIds,
  fetchOptimalRelay,
  initialFinalsLineup,
  initialLineup,
  lineupTeamsOf,
  pendingDraft,
  poolAthletesFor,
  refinedPoolFor,
  settingsKey,
  defaultBuildSettings,
  relayRoundSwum,
  relayShareEvent,
  type AthleteOption,
  type RelayResult,
  type RelaySlotData,
} from "@/lib/meet/relay-builder"
import {
  deleteRelayDraft,
  deleteRelayDraftVersion,
  independentFinals,
  unpublishRelayLineup,
  optimisticPublished,
  persistRelayDraft,
  persistRelayPublish,
  type RelayCommit,
  type RelayRoundsInfo,
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
  relayEditLockChannelName,
  relayEditLockHolderName,
  type RelayEditLockInfo,
  type RelayEditLockYieldMessage,
} from "@/lib/meet/relay-edit-lock-shared"
import { editorLabel, isLiveBuilderLineup, locksChanged, slotSignature, unpublishedLineupPhrase } from "./relay-workspace"
import { relayRoundsKey } from "@/lib/meet/relay-rounds"

type LockResponse = Partial<RelayEditLockInfo> & { error?: string; lock?: RelayEditLockInfo }

/** The builder on screen: what it opened with, to notice when someone else saves the event meanwhile. */
type Opened = {
  slug: string
  /** slotSignature of the event's data when the builder opened (or last caught up). */
  signature: string
  /** Bumped to remount the builder on fresh data. */
  version: number
  /** Opened while this tab's own save of the event was still landing: its data catches up quietly. */
  ownSave: boolean
  /** Someone else saved the event since the builder opened, and the builder has unsaved changes. */
  newer: boolean
  /** A lineup whose save failed, reopened to try again. */
  restore: RelayCommit | null
}

/**
 * Optimal result at the builder's default settings, per relay event. For an event with nothing
 * saved it's the summary's suggestion; for drafts and published lineups it supplies the stroke
 * times and alternates the builder re-times them with — so opening any event is instant.
 */
/** `settings`: settingsKey of the settings it was built at. */
type Build =
  | { status: "ok"; result: RelayResult; settings: string }
  | { status: "error"; error: string; settings: string }

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
  finalsSession,
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
  /**
   * The meet has a finals session: a round not swum yet stays open to publish after other results
   * are in. Which relays get a lineup per round is per event (`RelaySlotData.rounds`).
   */
  finalsSession: boolean
  viewerAthleteId: string | null
  backLink: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Lineups saved from the builder, shown until the server data catches up.
  const [overrides, setOverrides] = useState<Record<string, RelaySlotData>>({})
  /**
   * "Prelims & finals" choices saved from the builder, by relayRoundsKey (Women's and Men's share
   * one), shown until the server data catches up.
   */
  const [roundChoices, setRoundChoices] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  /** The lineup whose save failed, so the error can offer to reopen it. */
  const [failed, setFailed] = useState<{ slug: string; change: RelayCommit } | null>(null)
  const [seenSlots, setSeenSlots] = useState(serverSlots)
  /** The open builder: what it opened with (see `Opened`). */
  const [opened, setOpened] = useState<Opened | null>(null)
  /** The open builder has unsaved changes (reported by the builder). */
  const [builderDirty, setBuilderDirty] = useState(false)
  if (seenSlots !== serverSlots) {
    // Fresh server data: drop overrides for saves that have landed.
    setSeenSlots(serverSlots)
    setOverrides((current) =>
      Object.fromEntries(Object.entries(current).filter(([slug]) => saving.includes(slug)))
    )
    if (saving.length === 0) setRoundChoices({})
    // Someone else saved the event whose builder is open: show their lineup — at once when nothing
    // here is unsaved, else on the coach's say-so.
    const fresh = opened ? serverSlots.find((d) => d.slot.slug === opened.slug) : undefined
    if (opened && fresh && !saving.includes(opened.slug)) {
      const signature = slotSignature(fresh)
      if (opened.ownSave) setOpened({ ...opened, signature, ownSave: false })
      else if (signature !== opened.signature) {
        setOpened(
          builderDirty
            ? { ...opened, newer: true }
            : { ...opened, signature, version: opened.version + 1, newer: false, restore: null }
        )
      }
    }
  }
  const slots = useMemo(
    () =>
      serverSlots.map((server) => {
        const data = overrides[server.slot.slug] ?? server
        const choice = roundChoices[relayRoundsKey(data.slot.event, data.slot.gender)]
        // Results decide a locked event; a choice still saving overrides the rest.
        if (choice == null || data.rounds?.locked) return data
        return { ...data, rounds: { on: choice, locked: null } }
      }),
    [serverSlots, overrides, roundChoices]
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

  function roundsOf(data: RelaySlotData): RelayRoundsInfo {
    return {
      finalsSession,
      prelimsFinals: data.rounds?.on === true,
      locked: data.rounds?.locked ?? null,
      swum: { P: relayRoundSwum(data.published, "P"), F: relayRoundSwum(data.published, "F") },
    }
  }

  function saveTarget(data: RelaySlotData, relayEvent: string, lockToken?: string | null, prelimsFinals?: boolean) {
    const { slot } = data
    const rounds = roundsOf(data)
    return {
      meetId,
      event: slot.event,
      relayEvent,
      gender: slot.gender,
      published: data.published,
      rounds: prelimsFinals != null && !rounds.locked ? { ...rounds, prelimsFinals } : rounds,
      prelimsFinals,
      lockToken,
    }
  }

  /** Show a saved lineup on the summary at once, before it persists. */
  function show(
    data: RelaySlotData,
    { kind, teams, finalsTeams: finalsLineup, relayEvent, optimal, settings, prelimsFinals }: RelayCommit
  ) {
    const { slot } = data
    if (prelimsFinals != null) {
      setRoundChoices((current) => ({ ...current, [relayRoundsKey(slot.event, slot.gender)]: prelimsFinals }))
    }
    const savedAt = new Date().toISOString()
    const finalsTeams = independentFinals(teams, finalsLineup)
    setOverrides((current) => ({
      ...current,
      [slot.slug]:
        kind === "draft"
          ? {
              slot,
              published: data.published.filter((relay) => !relay.manual),
              draft: { teams, finalsTeams, savedAt, optimal, settings },
              rounds: data.rounds,
              versions: data.versions,
            }
          : {
              slot,
              published: optimisticPublished(saveTarget(data, relayEvent, null, prelimsFinals), teams, finalsTeams),
              draft: { teams, finalsTeams, savedAt, settings, published: true },
              rounds: data.rounds,
              versions: data.versions,
            },
    }))
    setSaving((current) => [...current, slot.slug])
    setSaveError(null)
    setFailed(null)
  }

  /** Persist a lineup `show` put on the summary; resolves to an error message, if any. */
  async function persist(
    data: RelaySlotData,
    change: RelayCommit,
    report = true,
    lockToken?: string | null
  ): Promise<string | null> {
    const { kind, teams, finalsTeams, relayEvent, optimal, settings, prelimsFinals } = change
    const { slot } = data
    const target = saveTarget(data, relayEvent, lockToken, prelimsFinals)
    try {
      if (kind === "draft") await persistRelayDraft(target, teams, optimal, settings, finalsTeams)
      else await persistRelayPublish(target, teams, settings, finalsTeams)
      return null
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      if (report) {
        setSaveError(`${slot.label}: ${message}`)
        setFailed({ slug: slot.slug, change })
      }
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
  const [takeover, setTakeoverState] = useState<{ slug: string; lock: RelayEditLockInfo } | null>(null)
  const takeoverRef = useRef(takeover)
  function setTakeover(next: { slug: string; lock: RelayEditLockInfo } | null) {
    takeoverRef.current = next
    setTakeoverState(next)
  }
  const [takingOver, setTakingOver] = useState(false)
  const [takeoverError, setTakeoverError] = useState<string | null>(null)
  /** Who asked to take over the event this tab is editing; the builder then saves and leaves. */
  const [takeoverBy, setTakeoverBy] = useState<{ name: string; self: boolean } | null>(null)
  /** Who is editing which event, for the summary and Publish all. */
  const [locks, setLocks] = useState<RelayEditLockInfo[]>([])
  /** Why the builder closed on its own (taken over, idle, lock lost). */
  const [notice, setNotice] = useState<string | null>(null)
  /** Read by the heartbeat, which outlives renders. */
  const builderDirtyRef = useRef(builderDirty)
  useEffect(() => {
    builderDirtyRef.current = builderDirty
  })

  const slotLabel = (slug: string) => slots.find((d) => d.slot.slug === slug)?.slot.label ?? "this relay"

  /**
   * Events whose lock this tab still has but is giving up (a save landing, then the release). The
   * lock list still shows them as ours meanwhile — not "Open in another tab".
   */
  const [releasing, setReleasing] = useState<string[]>([])
  /** Bumped once a release lands, to refresh the lock list right away. */
  const [locksVersion, setLocksVersion] = useState(0)
  /** Saves and releases still landing, per event: reopening that event waits for them. */
  const pendingReleases = useRef(new Map<string, Promise<unknown>>())

  /** Another session's lock on an event — not this tab's own, still releasing after a save. */
  const editorOf = (slug: string) =>
    locks.find(
      (lock) => lock.slot === slug && !(lock.lockedByMe && (releasing.includes(slug) || saving.includes(slug)))
    ) ?? null

  function trackRelease(slug: string, promise: Promise<unknown>) {
    pendingReleases.current.set(slug, promise)
    void promise.finally(() => {
      if (pendingReleases.current.get(slug) === promise) pendingReleases.current.delete(slug)
    })
  }

  function markReleasing(slug: string) {
    setReleasing((current) => (current.includes(slug) ? current : [...current, slug]))
  }

  function releaseLock(lock: { slug: string; token: string | null }): Promise<void> {
    if (!lock.token) return Promise.resolve()
    markReleasing(lock.slug)
    const released = fetch(`${lockUrl}?slot=${encodeURIComponent(lock.slug)}`, {
      method: "DELETE",
      keepalive: true,
      headers: { [RELAY_EDIT_LOCK_TOKEN_HEADER]: lock.token },
    })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        // Drop it from the list now rather than when the refetch lands, or it'd flash as another tab's.
        setLocks((current) => current.filter((held) => !(held.slot === lock.slug && held.lockedByMe)))
        setReleasing((current) => current.filter((slug) => slug !== lock.slug))
        setLocksVersion((version) => version + 1)
      })
    trackRelease(lock.slug, released)
    return released
  }

  /** Events this tab is claiming right now, so a double request can't trip over its own lock. */
  const acquiringRef = useRef(new Set<string>())
  /** Events this tab is taking over right now. */
  const forcingRef = useRef(new Set<string>())

  async function claim(slug: string, force: boolean): Promise<{ ok: boolean; status: number; body: LockResponse }> {
    const res = await fetch(lockUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: slug, force }),
    })
    const body = (await res.json().catch(() => ({}))) as LockResponse
    return { ok: res.ok && Boolean(body.token), status: res.status, body }
  }

  /** Show `slug`'s builder (this tab is claiming or holds its lock). */
  function showBuilder(slug: string, token: string | null, replace: boolean, restore: RelayCommit | null = null) {
    const data = slots.find((d) => d.slot.slug === slug)
    setHeld({ slug, token })
    setOpened({
      slug,
      signature: data ? slotSignature(data) : "",
      version: (opened?.version ?? 0) + 1,
      // Still showing this tab's own save (optimistically, or until it lands): not someone else's.
      ownSave: saving.includes(slug) || slug in overrides || pendingReleases.current.has(slug),
      newer: false,
      restore,
    })
    setBuilderDirty(restore != null)
    setTakeover(null)
    setNotice(null)
    go(slug, replace)
  }

  /**
   * Show an event's builder and claim its lock. A plain open shows the builder at once and backs out
   * to the takeover dialog if someone else has it — or, when the summary already knows someone is
   * editing it, asks first. A takeover waits for the lock.
   */
  async function openEvent(
    slug: string,
    { replace = false, force = false, restore = null }: { replace?: boolean; force?: boolean; restore?: RelayCommit | null } = {}
  ) {
    const current = heldRef.current
    if (current?.slug === slug) {
      go(slug, replace)
      return
    }
    // From the summary, an event someone else is known to be editing goes straight to the dialog
    // (checked with the server below, in case they've just left).
    const known = !force && !current ? editorOf(slug) : null
    if (!force) {
      // Switching events from the builder: the previous one is free again.
      if (current) releaseLock(current)
      if (known) setTakeover({ slug, lock: known })
      else showBuilder(slug, null, replace, restore)
    }
    if (force) {
      if (forcingRef.current.has(slug)) return
      forcingRef.current.add(slug)
      setTakingOver(true)
      setTakeoverError(null)
      // A tab of this browser holding the event hears this at once, rather than on its next heartbeat.
      try {
        const channel = new BroadcastChannel(relayEditLockChannelName(meetId))
        channel.postMessage({ type: "yield", slot: slug } satisfies RelayEditLockYieldMessage)
        channel.close()
      } catch {
        // No BroadcastChannel: the heartbeat carries the request instead.
      }
    } else {
      // A claim already in flight (e.g. reopened right after leaving) lands on the builder shown above.
      if (acquiringRef.current.has(slug)) return
      acquiringRef.current.add(slug)
    }
    /** Back to the summary if this open is still the builder on screen. */
    const backOut = () => {
      if (force || heldRef.current?.slug !== slug || heldRef.current.token) return
      setHeld(null)
      setOpened(null)
      go(null, true)
    }
    try {
      // This tab's own save of the event (and its release) lands first, so it isn't mistaken for
      // another tab's lock.
      await pendingReleases.current.get(slug)?.catch(() => undefined)
      const { ok, body } = await claim(slug, force)
      if (!ok) {
        if (body.lock && !force) {
          if (known) {
            // Still theirs: keep the dialog up to date, if it's still open.
            if (takeoverRef.current?.slug === slug) setTakeover({ slug, lock: body.lock })
            return
          }
          backOut()
          setTakeover({ slug, lock: body.lock })
          return
        }
        throw new Error(body.error ?? "Couldn't open this relay")
      }
      const token = body.token as string
      if (force) {
        if (current) releaseLock(current)
        showBuilder(slug, token, replace)
        setTakeoverBy(null)
      } else if (known) {
        // They'd already left: open it, unless the dialog was closed or a takeover is under way.
        if (takeoverRef.current?.slug === slug && !forcingRef.current.has(slug)) showBuilder(slug, token, replace, restore)
        else releaseLock({ slug, token })
      } else if (heldRef.current?.slug === slug && !heldRef.current.token) {
        setHeld({ slug, token })
      } else {
        // Left the builder before the lock landed.
        releaseLock({ slug, token })
        return
      }
      // Whatever was saved before this claim (e.g. the draft a takeover just saved) shows now.
      if (heldRef.current?.token === token) router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      if (force) setTakeoverError(message)
      else if (!known) {
        backOut()
        setSaveError(message)
      }
    } finally {
      if (force) {
        forcingRef.current.delete(slug)
        setTakingOver(false)
      } else {
        acquiringRef.current.delete(slug)
      }
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
    setOpened(null)
    go(null, replace)
  }

  /** Save the builder's lineup in the background and show the summary; resolves to an error, if any. */
  function commit(data: RelaySlotData, change: RelayCommit, replace: boolean): Promise<string | null> {
    // The save carries this tab's lock, which is released only once it lands.
    const lock = heldRef.current?.slug === data.slot.slug ? heldRef.current : null
    if (lock) markReleasing(lock.slug)
    setHeld(null)
    setOpened(null)
    show(data, change)
    const saved = persist(data, change, true, lock?.token).then(async (error) => {
      if (lock) await releaseLock(lock)
      return error
    })
    trackRelease(data.slot.slug, saved)
    go(null, replace)
    return saved
  }

  /** The builder's session ended on its own: save its unsaved changes as a draft, then say why. */
  function endSession(
    data: RelaySlotData,
    reason: "takeover" | "idle",
    draft: RelayCommit | null,
    replace: boolean
  ) {
    const { label } = data.slot
    const why =
      reason === "idle"
        ? `Your edit session for ${label} ended after 10 minutes without changes.`
        : takeoverBy?.self
          ? `You opened ${label} in another tab, so it closed here.`
          : `${takeoverBy?.name ?? "Another coach"} took over editing ${label}.`
    setTakeoverBy(null)
    if (!draft) {
      setNotice(why)
      leave(replace)
      return
    }
    // Saving a draft takes down what's published; say so, since nobody chose to unpublish.
    const takenDown = unpublishedLineupPhrase(data.published, data.rounds?.on === true)
    setNotice(`${why} Saving your changes as a draft…`)
    void commit(data, draft, replace).then((error) =>
      setNotice(
        error
          ? `${why} Your changes couldn't be saved as a draft.`
          : `${why} Your changes were saved as a draft${takenDown ? `, which takes down ${takenDown} until it's published again` : ""}.`
      )
    )
  }

  /**
   * Delete the open event's saved draft (and its settings) — with `unpublish`, the lineup the
   * builder published first — then reopen the builder on the optimal lineup with default
   * settings; resolves to an error message, if any.
   */
  async function deleteDraft(data: RelaySlotData, unpublish: boolean): Promise<string | null> {
    const { slot } = data
    const lock = heldRef.current?.slug === slot.slug ? heldRef.current : null
    const target = { meetId, event: slot.event, relayEvent: slot.event, gender: slot.gender, lockToken: lock?.token }
    try {
      if (unpublish) await unpublishRelayLineup(target)
    } catch (err) {
      return err instanceof Error ? err.message : "Something went wrong"
    }
    let failure: string | null = null
    try {
      await deleteRelayDraft(target)
    } catch (err) {
      // Unpublished, but the settings stay: the builder still goes back to optimal.
      if (!unpublish) return err instanceof Error ? err.message : "Something went wrong"
      failure = "Unpublished, but the builder settings couldn't be deleted."
    }
    if (failure) setSaveError(`${slot.label}: ${failure}`)
    setOverrides((current) => ({
      ...current,
      [slot.slug]: {
        ...data,
        published: unpublish ? data.published.filter((relay) => !isLiveBuilderLineup(relay)) : data.published,
        draft: failure ? data.draft : null,
        // The deleted draft's own version goes with it.
        versions:
          failure || !data.draft ? data.versions : data.versions?.filter((v) => v.savedAt !== data.draft?.savedAt),
      },
    }))
    // A fresh builder for the event: with no draft it opens on the optimal lineup. The server
    // data catching up is this tab's own change, so it doesn't reopen the builder again.
    setOpened((current) =>
      current && current.slug === slot.slug
        ? { ...current, version: current.version + 1, ownSave: true, newer: false, restore: null }
        : current
    )
    setBuilderDirty(false)
    router.refresh()
    return null
  }

  /** Delete one earlier version of the open event; resolves to an error message, if any. */
  async function deleteVersion(data: RelaySlotData, versionId: string): Promise<string | null> {
    const { slot } = data
    const lock = heldRef.current?.slug === slot.slug ? heldRef.current : null
    try {
      await deleteRelayDraftVersion({ meetId, event: slot.event, gender: slot.gender, lockToken: lock?.token }, versionId)
    } catch (err) {
      return err instanceof Error ? err.message : "Something went wrong"
    }
    setOverrides((current) => {
      const base = current[slot.slug] ?? data
      return { ...current, [slot.slug]: { ...base, versions: base.versions?.filter((v) => v.id !== versionId) } }
    })
    // Fresh data is this tab's own change: the open builder keeps its lineup.
    setOpened((current) => (current && current.slug === slot.slug ? { ...current, ownSave: true } : current))
    router.refresh()
    return null
  }

  /** Someone else saved the event while the builder had unsaved changes: show theirs instead. */
  function loadNewer() {
    if (!opened) return
    const fresh = serverSlots.find((d) => d.slot.slug === opened.slug)
    setOpened({
      ...opened,
      signature: fresh ? slotSignature(fresh) : opened.signature,
      version: opened.version + 1,
      newer: false,
      restore: null,
    })
    setBuilderDirty(false)
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
    let reclaiming = false
    async function beat() {
      const res = await fetch(lockUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: lock.slug, token: lock.token }),
      })
      const body = (await res.json().catch(() => ({}))) as LockResponse
      if (heldRef.current?.token !== lock.token) return
      if (res.ok) {
        if (body.yieldRequested) {
          setTakeoverBy({
            name: relayEditLockHolderName({ lockedBy: body.yieldRequestedBy ?? null }),
            // The same coach, from another tab or device.
            self: body.yieldRequestedBy != null && body.yieldRequestedBy.id === body.lockedBy?.id,
          })
        }
        return
      }
      if (res.status !== 409) return
      if (!body.lock?.locked && !reclaiming) {
        // It lapsed (e.g. this tab slept in the background) and nobody else has it: claim it again
        // and keep editing.
        reclaiming = true
        const again = await claim(lock.slug, false).catch(() => null)
        reclaiming = false
        if (heldRef.current?.token !== lock.token) {
          if (again?.ok && again.body.token) releaseLock({ slug: lock.slug, token: again.body.token })
          return
        }
        if (again?.ok && again.body.token) {
          setHeld({ slug: lock.slug, token: again.body.token })
          return
        }
        if (again?.body.lock) body.lock = again.body.lock
      }
      // Lost without a chance to save (someone claimed it after it lapsed).
      const unsaved = builderDirtyRef.current ? " Your unsaved changes weren't saved." : ""
      setHeld(null)
      setOpened(null)
      go(null, true)
      setNotice(
        body.lock?.locked
          ? body.lock.lockedByMe
            ? `You opened ${slotLabel(lock.slug)} in another tab, so it closed here.${unsaved}`
            : `${relayEditLockHolderName(body.lock)} took over editing ${slotLabel(lock.slug)}.${unsaved}`
          : `Your edit session for ${slotLabel(lock.slug)} expired.${unsaved}`
      )
    }
    const timer = window.setInterval(() => void beat().catch(() => undefined), RELAY_EDIT_LOCK_HEARTBEAT_MS)
    // Background tabs' timers are throttled: renew as soon as the tab is back.
    const onVisible = () => {
      if (!document.hidden) void beat().catch(() => undefined)
    }
    document.addEventListener("visibilitychange", onVisible)
    const onPageHide = () => void releaseLock(lock)
    window.addEventListener("pagehide", onPageHide)
    // Another tab of this browser taking the event over says so at once.
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(relayEditLockChannelName(meetId))
      channel.onmessage = (event: MessageEvent<RelayEditLockYieldMessage>) => {
        if (event.data?.type === "yield" && event.data.slot === lock.slug && heldRef.current?.token === lock.token) {
          setTakeoverBy({ name: "", self: true })
        }
      }
    } catch {
      channel = null
    }
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pagehide", onPageHide)
      channel?.close()
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
  /** The last lock list seen, to notice someone finishing an event (see below). */
  const lastLocks = useRef<RelayEditLockInfo[] | null>(null)
  useEffect(() => {
    if (selectedSlug) return
    let cancelled = false
    async function load() {
      if (document.hidden) return
      const res = await fetch(lockUrl)
      if (!res.ok) return
      const body = (await res.json().catch(() => ({}))) as { locks?: RelayEditLockInfo[] }
      if (cancelled) return
      const next = body.locks ?? []
      // Someone finished editing an event (and likely saved it): fetch the lineups again, so the
      // summary — and the builder opened next — shows what they saved.
      if (lastLocks.current && locksChanged(lastLocks.current, next)) router.refresh()
      lastLocks.current = next
      setLocks(next)
    }
    void load().catch(() => undefined)
    const timer = window.setInterval(() => void load().catch(() => undefined), RELAY_EDIT_LOCK_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [selectedSlug, lockUrl, locksVersion, router])

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
      .map((data) => {
        // Built at the settings the builder opens with — a draft's (or the published lineup's)
        // saved settings, else the defaults — so opening the builder reuses this build.
        const settings = data.draft?.settings ?? defaultBuildSettings(hasSignups)
        return {
          data,
          settings,
          key: `${data.slot.slug}|${settingsKey(settings)}`,
          fixed: initialLineup(data, data.rounds?.on ? "P" : undefined).fixed,
          finals: data.rounds?.on ? initialFinalsLineup(data) : null,
        }
      })
      .filter(({ key }) => !requested.current.has(key))
      .filter(({ data, fixed }) => fixed || (pools.get(data.slot.slug) ?? []).length > 0)
    if (pending.length === 0) return
    for (const { key } of pending) requested.current.add(key)

    const run = (batch: typeof pending) => {
      if (batch.length === 0) return
      void Promise.all(
        batch.map(async ({ data: { slot }, settings, fixed, finals }): Promise<[string, Build]> => {
          const key = settingsKey(settings)
          try {
            const { options, included } = refinedPoolFor(athletes, slot.gender, slot.event, settings, signupRelayPrefs)
            const narrowed = !(settings.signupPool === "all" && included.length === options.length)
            const res = await fetchOptimalRelay({
              meetId,
              event: slot.event,
              course,
              gender: slot.gender,
              relayCount: fixed ? fixed.length : DEFAULT_RELAY_COUNT,
              withinDays: settings.withinDays,
              limitDays: settings.limitDays,
              // Finals' own swimmers are timed too, for when the builder shows that round.
              athleteIds: buildAthleteIds(included, narrowed, fixed && [...fixed, ...(finals ?? [])]),
            })
            return [
              slot.slug,
              res.ok && (fixed || res.result.teams.length > 0)
                ? { status: "ok", result: res.result, settings: key }
                : { status: "error", error: res.ok ? "Not enough swimmers." : res.error, settings: key },
            ]
          } catch {
            return [slot.slug, { status: "error", error: "Couldn't build a suggestion.", settings: key }]
          }
        })
      ).then((entries) => setBuilds((prev) => ({ ...prev, ...Object.fromEntries(entries) })))
    }
    // Suggestions show together as one batch; drafts and published lineups are already on
    // screen, so their builds run alongside and never hold the suggestions up.
    run(pending.filter(({ fixed }) => !fixed))
    run(pending.filter(({ fixed }) => fixed))
  }, [selectedSlug, slots, pools, course, hasSignups, meetId, athletes, signupRelayPrefs])

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
        {(() => {
          const data = slots.find((d) => d.slot.slug === takeover.slug)
          const takenDown = data ? unpublishedLineupPhrase(data.published, data.rounds?.on === true) : null
          return takenDown ? ` If there are changes, saving them as a draft takes down ${takenDown} until it's published again.` : null
        })()}
      </p>
    ) : null}
    {takeoverError ? <p className="mt-3 text-sm text-error">{takeoverError}</p> : null}
  </Modal>
  )

  // Background saves and session notices show over the builder too, not only on the summary.
  const banners =
    saveError || notice ? (
      <div className="flex flex-col gap-3">
        {saveError ? (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error"
          >
            <p>{saveError}</p>
            <span className="flex shrink-0 items-center gap-3">
              {/* From the summary only: opening it from a builder would drop that builder's changes. */}
              {failed && !held ? (
                <button
                  type="button"
                  onClick={() => {
                    const { slug, change } = failed
                    setSaveError(null)
                    setFailed(null)
                    void openEvent(slug, { restore: change })
                  }}
                  className="font-medium hover:underline"
                >
                  Reopen
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSaveError(null)
                  setFailed(null)
                }}
                className="font-medium hover:underline"
              >
                Dismiss
              </button>
            </span>
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
      </div>
    ) : null

  // The builder shows only once this tab holds the event's lock.
  const selected =
    selectedSlug && held?.slug === selectedSlug ? slots.find((d) => d.slot.slug === selectedSlug) : null
  if (selected) {
    const current = opened?.slug === selected.slot.slug ? opened : null
    return (
      <>
        <MeetRelayBuilder
          key={`${selected.slot.slug}:${current?.version ?? 0}`}
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
          initialBaseSettings={builds[selected.slot.slug]?.settings ?? null}
          slots={slots.map((d) => d.slot)}
          athletes={athletes}
          signupRelayPrefs={signupRelayPrefs}
          hasImportedResults={hasImportedResults}
          rounds={roundsOf(selected)}
          siblingFinals={siblingFinalsOf(slots, selected)}
          onCommit={(change, replace) => commit(selected, change, replace)}
          onExit={(slug, replace) => (slug ? void openEvent(slug, { replace }) : leave(replace))}
          takeoverRequested={takeoverBy != null}
          locked={held?.token != null}
          onSessionEnd={(reason, draft, replace) => endSession(selected, reason, draft, replace)}
          onDirtyChange={setBuilderDirty}
          newerSaved={current?.newer === true}
          onLoadNewer={loadNewer}
          onDeleteDraft={(unpublish) => deleteDraft(selected, unpublish)}
          onDeleteVersion={(versionId) => deleteVersion(selected, versionId)}
          restore={current?.restore ?? null}
          banner={banners}
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
        cards: draftSummaryCards(slot.slug, draft),
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
            settings: settingsKey(defaultBuildSettings(hasSignups)),
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
    return editor ? { ...event, editor: editorLabel(editor) } : event
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
      change: {
        kind: "publish" as const,
        teams,
        finalsTeams: pendingDraft(data)?.finalsTeams,
        relayEvent,
        settings: pendingDraft(data)?.settings,
      },
    }))
    for (const { data, change } of commits) show(data, change)
    // One event at a time: each save rewrites the meet's relays and drafts, so parallel saves
    // would overwrite each other.
    const errors: (string | null)[] = []
    for (const { data, change } of commits) errors.push(await persist(data, change, false))
    const failures = ready.flatMap(({ data }, i) => (errors[i] ? [`${data.slot.label} (${errors[i]})`] : []))
    const published = ready.length - failures.length
    const problems = [
      ...failures,
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
      {banners}
      <RelaySummary events={editingEvents} onOpen={(slug) => void openEvent(slug)} />
      {takeoverModal}
    </main>
  )
}

/**
 * The other gender's relay of the same event (Women's ↔ Men's) when it has a finals lineup of its
 * own — turning "Prelims & finals" off drops it too. Null for mixed relays.
 */
function siblingFinalsOf(slots: RelaySlotData[], data: RelaySlotData): string | null {
  const { slot } = data
  if (slot.gender === "X") return null
  const key = relayRoundsKey(slot.event, slot.gender)
  const sibling = slots.find(
    (d) => d.slot.gender !== slot.gender && d.slot.gender !== "X" && relayRoundsKey(d.slot.event, d.slot.gender) === key
  )
  return sibling && initialFinalsLineup(sibling) ? sibling.slot.label : null
}

/** A draft's dashed cards — prelims and finals apart when finals has a lineup of its own. */
function draftSummaryCards(slug: string, draft: NonNullable<RelaySlotData["draft"]>) {
  const finals = independentFinals(draft.teams, draft.finalsTeams)
  if (!finals) return lineupSummaryCards(slug, draft.teams)
  return [
    ...lineupSummaryCards(`${slug}-P`, draft.teams, "Prelims"),
    ...lineupSummaryCards(`${slug}-F`, finals, "Finals"),
  ]
}
