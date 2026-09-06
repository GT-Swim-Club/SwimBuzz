"use client"

import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import RichTextField from "@/components/ui/RichTextField"
import { DatePicker, TimePicker, TimeZonePicker } from "@/components/ui/CustomDateTimePicker"
import { useViewerTimeZone } from "@/components/ui/ZonedTime"
import { DEFAULT_TIME_ZONE } from "@swimbuzz/shared"
import { PRACTICE_EDIT_IDLE_TIMEOUT_MS, PRACTICE_EDIT_LOCK_HEARTBEAT_MS, PRACTICE_EDIT_LOCK_TOKEN_HEADER, type PracticeEditLockInfo } from "@/lib/practice/practice-edit-lock-shared"
import { broadcastPracticeEditLockChanged } from "@/lib/practice/practice-edit-lock-client"
import { ATHLETE_VIEW_ENABLING_EVENT } from "@/lib/athlete/athlete-view"
import { practicePath } from "@/lib/slug"
import { MAX_PRACTICE_SETS } from "@/lib/practice/practice-input"
import InfoIcon from "@/components/ui/InfoIcon"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import PracticeViewSkeleton from "./[id]/PracticeViewSkeleton"
import { getLocalDayKey } from "./PracticeCalendarLocal"

export type SetFormState = {
  id?: string
  title: string
  content: string
  distance: string
  dragId?: string
  /** False means this set sits side-by-side with the previous one, in the same row. */
  startsNewRow?: boolean
}

type SetDropZone = "left" | "right" | "top" | "bottom"

export type PracticeFormState = {
  title: string
  date: string
  startTime: string
  endTime: string
  timeZone: string
  location: string
  focus: string
  tags: string[]
  published?: boolean
  sets: SetFormState[]
}

export const emptySet: SetFormState = {
  title: "",
  content: "",
  distance: "",
}

function createSetDragId() {
  return "set-" + Math.random().toString(36).slice(2, 10)
}

function ensureSetDragIds(form: PracticeFormState): PracticeFormState {
  return {
    ...form,
    sets: form.sets.map((set) => ({
      ...set,
      dragId: set.dragId ?? set.id ?? createSetDragId(),
    })),
  }
}

export const emptyPractice: PracticeFormState = {
  title: "",
  date: getLocalDayKey(),
  startTime: "19:30",
  endTime: "21:00",
  timeZone: DEFAULT_TIME_ZONE,
  location: "CRC Comp Pool",
  focus: "",
  tags: [],
  sets: [{ ...emptySet }],
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
const labelCls = "mb-1 block text-xs font-medium text-foreground-secondary"
type AutosaveState = "idle" | "saving" | "saved" | "error"
const AUTOSAVE_DELAY_MS = 700

function clockToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function minutesToClock(total: number): string {
  const clamped = Math.max(0, Math.min(total, 23 * 60 + 59))
  const hour = Math.floor(clamped / 60)
  const minute = clamped % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** Keep end at or after start; lower values are clamped to the start time. */
function endOnOrAfterStart(start: string, preferredEnd?: string): string {
  const startMinutes = clockToMinutes(start)
  if (startMinutes == null) return preferredEnd || "21:00"
  const preferredMinutes = preferredEnd ? clockToMinutes(preferredEnd) : null
  if (preferredMinutes != null && preferredMinutes >= startMinutes) return preferredEnd!
  return minutesToClock(startMinutes)
}
function normalizePracticeTimes(form: PracticeFormState): PracticeFormState {
  const startMinutes = clockToMinutes(form.startTime)
  const endMinutes = clockToMinutes(form.endTime)
  if (startMinutes == null || endMinutes == null || endMinutes >= startMinutes) {
    return form
  }
  return { ...form, endTime: endOnOrAfterStart(form.startTime) }
}

function isPracticeSaveable(form: PracticeFormState) {
  return Boolean(
    form.date.trim() &&
      form.startTime.trim() &&
      form.endTime.trim() &&
      form.location.trim()
  )
}

export default function PracticeEditor({
  practiceId,
  practiceSlug,
  initial,
  onCancel,
  holdEditLock = false,
  editLockToken = null,
  onLockLost,
  availableTags = [],
}: {
  practiceId?: string
  practiceSlug?: string | null
  initial?: PracticeFormState
  onCancel?: (nextSlug?: string | null) => void
  /** When true, keep the exclusive edit lock alive and release on exit. */
  holdEditLock?: boolean
  /** Per-tab lock token from acquire — required when holdEditLock is true. */
  editLockToken?: string | null
  /** Fired when another session steals the lock; do not release afterward. */
  onLockLost?: (
    message: string,
    lock?: PracticeEditLockInfo | null,
    nextSlug?: string | null
  ) => void
  availableTags?: string[]
}) {
  const router = useRouter()
  const viewerTimeZone = useViewerTimeZone()
  const [error, setError] = useState<string | null>(null)
  const [setPendingDeletion, setSetPendingDeletion] = useState<{ dragId: string; title: string } | null>(null)
  const [form, setForm] = useState<PracticeFormState>(() =>
    ensureSetDragIds(normalizePracticeTimes(initial ?? emptyPractice))
  )
  const isCreateRef = useRef(!initial)
  const zoneSeededRef = useRef(false)
  const [isDirty, setIsDirty] = useState(false)
  const [hasEditedContent, setHasEditedContent] = useState(!isCreateRef.current)
  const [persistedId, setPersistedId] = useState<string | null>(practiceId ?? null)
  const [lockToken, setLockToken] = useState<string | null>(editLockToken ?? null)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>(
    practiceId ? "saved" : "idle"
  )
  const [autosaveVersion, setAutosaveVersion] = useState(0)
  const [draggedSetKey, setDraggedSetKey] = useState<string | null>(null)
  const [dropTargetSetKey, setDropTargetSetKey] = useState<string | null>(null)
  const [dropZone, setDropZone] = useState<SetDropZone | null>(null)
  const [barOverContent, setBarOverContent] = useState(false)
  const [barMaxWidth, setBarMaxWidth] = useState("100%")
  const [exiting, setExiting] = useState(false)
  const [confirmPublishState, setConfirmPublishState] = useState<boolean | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const barContentEndRef = useRef<HTMLDivElement>(null)
  const setsSectionRef = useRef<HTMLElement>(null)
  const updateBarOverlapRef = useRef(() => {})
  const draggedSetKeyRef = useRef<string | null>(null)
  const dropTargetSetKeyRef = useRef<string | null>(null)
  const dropZoneRef = useRef<SetDropZone | null>(null)
  const autoScrollSpeedRef = useRef(0)
  const autoScrollRafRef = useRef<number | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const setRowRefs = useRef(new Map<string, HTMLElement>())
  const releasedRef = useRef(false)
  const lostRef = useRef(false)
  const yieldingRef = useRef(false)
  const yieldToTakeoverRef = useRef<() => void>(() => {})
  const expireIdleSessionRef = useRef<() => void>(() => {})
  const releaseForAthleteViewRef = useRef<() => void>(() => {})
  const idleTimerRef = useRef<number | null>(null)
  const savedSnapshotRef = useRef(JSON.stringify(form))
  const formRef = useRef(form)
  const unsavedChangesRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)
  const autosavePromiseRef = useRef<Promise<void> | null>(null)
  const autosaveInFlightRef = useRef(false)
  const persistedIdRef = useRef<string | null>(practiceId ?? null)
  const slugRef = useRef<string | null>(practiceSlug ?? null)
  /** True once the user has actually changed something, as opposed to the automatic timezone seed on create. */
  const userEditedRef = useRef(false)

  function rememberSlug(data: { slug?: unknown; id?: unknown }): string | null {
    if (typeof data.slug === "string" && data.slug) {
      slugRef.current = data.slug
      return data.slug
    }
    if (typeof data.id === "string" && data.id) {
      return slugRef.current ?? data.id
    }
    return slugRef.current
  }

  function leaveEditor(nextSlug?: string | null) {
    const slug = nextSlug ?? slugRef.current
    if (onCancel) {
      onCancel(slug)
      return
    }
    if (slug) {
      router.push(practicePath(slug))
      router.refresh()
      return
    }
    router.push("/practices")
  }
  
  useEffect(() => {
    formRef.current = form
    const dirty = JSON.stringify(form) !== savedSnapshotRef.current
    unsavedChangesRef.current = dirty
    setIsDirty(dirty)
    if (dirty && !autosaveInFlightRef.current) {
      setAutosaveState("idle")
    }
  }, [form])

  useEffect(() => {
    // Seed the zone picker from the browser's zone once, on create only, after hydration
    // resolves the real viewer zone (viewerTimeZone starts at DEFAULT_TIME_ZONE to match SSR).
    // Editing an existing practice must never touch its stored zone this way.
    if (!isCreateRef.current || zoneSeededRef.current || viewerTimeZone === DEFAULT_TIME_ZONE) return
    zoneSeededRef.current = true
    updateForm((current) => ({ ...current, timeZone: viewerTimeZone }), { silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerTimeZone])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsavedChangesRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  useEffect(() => {
    const bar = barRef.current
    const contentEnd = barContentEndRef.current
    if (!bar || !contentEnd) return

    function updateBarOverlap() {
      const barEl = barRef.current
      const contentEl = barContentEndRef.current
      if (!barEl || !contentEl) return
      const barTop = barEl.getBoundingClientRect().top
      const contentBottom = contentEl.getBoundingClientRect().bottom
      setBarOverContent(contentBottom > barTop + 2)
    }
    updateBarOverlapRef.current = updateBarOverlap

    updateBarOverlap()
    window.addEventListener("scroll", updateBarOverlap, { passive: true })
    window.addEventListener("resize", updateBarOverlap)
    const observer = new ResizeObserver(updateBarOverlap)
    observer.observe(bar)
    observer.observe(contentEnd)
    if (setsSectionRef.current) observer.observe(setsSectionRef.current)
    return () => {
      window.removeEventListener("scroll", updateBarOverlap)
      window.removeEventListener("resize", updateBarOverlap)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    updateBarOverlapRef.current()
  }, [form.sets.length])

  function bumpIdleTimer() {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      void expireIdleSessionRef.current()
    }, PRACTICE_EDIT_IDLE_TIMEOUT_MS)
  }

  function updateForm(
    next: PracticeFormState | ((current: PracticeFormState) => PracticeFormState),
    options?: { silent?: boolean }
  ) {
    const nextForm = typeof next === "function" ? next(formRef.current) : next
    formRef.current = nextForm
    unsavedChangesRef.current = true
    setIsDirty(true)
    if (!options?.silent) {
      userEditedRef.current = true
      setHasEditedContent(true)
    }
    bumpIdleTimer()
    if (!isPracticeSaveable(nextForm) && autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    setForm(nextForm)
  }
  const tokenRef = useRef(lockToken)
  tokenRef.current = lockToken
  persistedIdRef.current = persistedId
  const onLockLostRef = useRef(onLockLost)
  onLockLostRef.current = onLockLost
  const shouldHoldLock = Boolean(persistedId && lockToken && (holdEditLock || !practiceId))

  function lockHeaders(extra?: HeadersInit): HeadersInit {
    const token = tokenRef.current
    return {
      ...(extra ?? {}),
      ...(token ? { [PRACTICE_EDIT_LOCK_TOKEN_HEADER]: token } : {}),
    }
  }

  function takeoverMessage(data: {
    error?: string
    lock?: PracticeEditLockInfo | null
  }): string {
    const lock = data.lock
    if (lock?.lockedByMe) {
      return "Another one of your tabs took over editing this practice. Your unsaved changes were not saved."
    }
    const name = lock?.lockedBy?.name?.trim()
    if (name) {
      return `${name} took over editing this practice. Your unsaved changes were not saved.`
    }
    return (
      data.error ??
      "Someone else took over editing this practice. Your unsaved changes were not saved."
    )
  }

  function handleLockLost(data: { error?: string; lock?: PracticeEditLockInfo | null }) {
    if (lostRef.current) return
    lostRef.current = true
    releasedRef.current = true
    const message = takeoverMessage(data)
    if (onLockLostRef.current) {
      onLockLostRef.current(message, data.lock ?? null, slugRef.current)
      return
    }
    setError(message)
    leaveEditor(slugRef.current)
  }

  async function releaseLock() {
    const id = persistedIdRef.current
    if (!id || !tokenRef.current || releasedRef.current || lostRef.current) return
    releasedRef.current = true
    try {
      await fetch(`/api/practices/${id}/lock`, {
        method: "DELETE",
        keepalive: true,
        headers: lockHeaders(),
      })
      broadcastPracticeEditLockChanged(id)
    } catch {
      // best-effort; lock expires on its own
    }
  }

  /** Removes the empty practice autosave created solely by opening the "new" form. */
  function isUntouchedDraft() {
    return isCreateRef.current && !userEditedRef.current && Boolean(persistedIdRef.current)
  }

  async function deleteUntouchedDraft() {
    const id = persistedIdRef.current
    if (!id) return
    releasedRef.current = true
    try {
      await fetch(`/api/practices/${id}`, {
        method: "DELETE",
        keepalive: true,
        headers: lockHeaders(),
      })
    } catch {
      // best-effort; an abandoned empty draft is harmless if this fails
    }
  }

  useEffect(() => {
    if (!shouldHoldLock || !persistedId || !lockToken) return
    releasedRef.current = false
    lostRef.current = false

    async function checkLock() {
      if (lostRef.current || releasedRef.current) return
      try {
        const res = await fetch(`/api/practices/${persistedId}/lock`, {
          method: "PATCH",
          headers: lockHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ token: tokenRef.current }),
        })
        const data = await res.json().catch(() => ({})) as PracticeEditLockInfo & { error?: string }
        if (lostRef.current || releasedRef.current) return
        if (data.yieldRequested) {
          void yieldToTakeoverRef.current()
          return
        }
        if (res.ok) return
        if (res.status === 409) {
          handleLockLost(data)
          return
        }
        setError(data.error ?? "Edit lock lost — cancel and try again")
      } catch {
        // ignore transient network errors
      }
    }

    void checkLock()
    bumpIdleTimer()
    const heartbeat = window.setInterval(() => {
      void checkLock()
    }, PRACTICE_EDIT_LOCK_HEARTBEAT_MS)

    function onPageHide() {
      if (isUntouchedDraft()) {
        void deleteUntouchedDraft()
        return
      }
      void releaseLock()
    }

    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.clearInterval(heartbeat)
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      window.removeEventListener("pagehide", onPageHide)
      // Do not release here — React Strict Mode remounts would drop the lock.
      // Release on cancel, save, or pagehide instead.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldHoldLock, persistedId, lockToken])

  function applyPersistedPractice(
    snapshot: PracticeFormState,
    data: { sets?: unknown; published?: unknown; slug?: unknown; id?: unknown }
  ) {
    rememberSlug(data)
    const persistedSets = Array.isArray(data.sets) ? data.sets : []
    const persistedIdByDragId = new Map(
      snapshot.sets.map((set, index) => [
        set.dragId,
        (persistedSets[index] as { id?: string } | undefined)?.id,
      ])
    )
    const published = data.published === true
    const savedForm: PracticeFormState = {
      ...snapshot,
      published,
      sets: snapshot.sets.map((set, index) => ({
        ...set,
        id: (persistedSets[index] as { id?: string } | undefined)?.id ?? set.id,
      })),
    }
    savedSnapshotRef.current = JSON.stringify(savedForm)
    const currentForm = formRef.current
    const reconciledForm: PracticeFormState = {
      ...currentForm,
      published: currentForm.published === true ? true : published,
      sets: currentForm.sets.map((set) => ({
        ...set,
        id: set.id ?? persistedIdByDragId.get(set.dragId),
      })),
    }
    if (JSON.stringify(reconciledForm) !== JSON.stringify(currentForm)) {
      formRef.current = reconciledForm
      setForm(reconciledForm)
    }
    const hasPendingChanges =
      JSON.stringify(reconciledForm) !== savedSnapshotRef.current
    unsavedChangesRef.current = hasPendingChanges
    setIsDirty(hasPendingChanges)
    setAutosaveState(hasPendingChanges ? "idle" : "saved")
    setAutosaveVersion((version) => version + 1)
  }

  async function acquireCreatedLock(id: string) {
    const res = await fetch(`/api/practices/${id}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? "Created the practice, but could not start an edit lock.")
      return
    }
    const token = typeof data.token === "string" ? data.token : null
    if (!token) {
      setError("Created the practice, but could not start an edit lock.")
      return
    }
    tokenRef.current = token
    setLockToken(token)
    broadcastPracticeEditLockChanged(id)
  }

  async function runAutosave() {
    if (lostRef.current || releasedRef.current || autosaveInFlightRef.current) {
      return
    }

    const snapshot = formRef.current
    if (!isPracticeSaveable(snapshot)) return
    const serialized = JSON.stringify(snapshot)
    if (serialized === savedSnapshotRef.current && persistedIdRef.current) {
      setAutosaveState("saved")
      return
    }

    const existingId = persistedIdRef.current
    if (existingId && !tokenRef.current) return

    autosaveInFlightRef.current = true
    setAutosaveState("saving")
    setError(null)

    const request = (async () => {
      try {
        const res = existingId
          ? await fetch(`/api/practices/${existingId}`, {
              method: "PATCH",
              headers: lockHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ ...snapshot, published: snapshot.published === true }),
            })
          : await fetch("/api/practices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...snapshot, published: false }),
            })
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 409) {
            handleLockLost(data)
            return
          }
          setAutosaveState("error")
          setError(data.error ?? "Autosave failed. Your changes are still in this editor.")
          return
        }
        if (!existingId && typeof data.id === "string") {
          persistedIdRef.current = data.id
          setPersistedId(data.id)
          rememberSlug(data)
          const nextPath = slugRef.current ? practicePath(slugRef.current) : null
          if (nextPath && window.location.pathname !== nextPath) {
            window.history.replaceState(window.history.state, "", nextPath)
          }
          await acquireCreatedLock(data.id)
        } else {
          rememberSlug(data)
        }
        applyPersistedPractice(snapshot, data)
      } catch {
        setAutosaveState("error")
        setError("Autosave failed. Your changes are still in this editor.")
      } finally {
        autosaveInFlightRef.current = false
        autosavePromiseRef.current = null
      }
    })()

    autosavePromiseRef.current = request
    await request
  }

  async function yieldToTakeover() {
    if (lostRef.current || releasedRef.current || yieldingRef.current) return
    yieldingRef.current = true
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    await autosavePromiseRef.current?.catch(() => undefined)
    await runAutosave()
    await releaseLock()
    handleLockLost({
      error: "Someone else took over editing this practice. Your latest changes were saved.",
    })
  }
  yieldToTakeoverRef.current = yieldToTakeover

  async function expireIdleSession() {
    if (lostRef.current || releasedRef.current || yieldingRef.current) return
    yieldingRef.current = true
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    await autosavePromiseRef.current?.catch(() => undefined)
    await runAutosave()
    await releaseLock()
    handleLockLost({
      error: "Your session expired — click Edit again to continue",
    })
  }
  expireIdleSessionRef.current = expireIdleSession

  /** Switching to Athlete View mid-edit: flush and release like a normal
   * exit, but skip handleLockLost — the page-level redirect (isCoach flips
   * false) unmounts this editor right after, so no takeover message is due. */
  async function releaseForAthleteView() {
    if (lostRef.current || releasedRef.current || yieldingRef.current) return
    yieldingRef.current = true
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    await autosavePromiseRef.current?.catch(() => undefined)
    await runAutosave()
    await releaseLock()
  }
  releaseForAthleteViewRef.current = releaseForAthleteView

  useEffect(() => {
    if (!shouldHoldLock || !persistedId || !lockToken) return

    let cancelled = false
    let requestAc: AbortController | null = null
    let lockChannel: BroadcastChannel | null = null

    function onAthleteViewEnabling() {
      void releaseForAthleteViewRef.current()
    }
    window.addEventListener(ATHLETE_VIEW_ENABLING_EVENT, onAthleteViewEnabling)

    async function watchLock(rev?: string) {
      while (!cancelled) {
        requestAc = new AbortController()
        try {
          const qs = rev ? `?watch=1&rev=${encodeURIComponent(rev)}` : ""
          const res = await fetch(`/api/practices/${persistedId}/lock${qs}`, {
            signal: requestAc.signal,
          })
          requestAc = null
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 2000))
            continue
          }
          const data = (await res.json()) as PracticeEditLockInfo
          if (cancelled || lostRef.current || releasedRef.current) return
          if (data.yieldRequested) {
            void yieldToTakeoverRef.current()
            return
          }
          rev = data.rev
        } catch {
          requestAc = null
          if (cancelled) return
        }
      }
    }

    void watchLock()

    if (typeof BroadcastChannel !== "undefined") {
      lockChannel = new BroadcastChannel(`swimbuzz-practice-lock:${persistedId}`)
      lockChannel.onmessage = (event) => {
        if (event.data && event.data.type === "yield") {
          void yieldToTakeoverRef.current()
        }
        requestAc?.abort()
      }
    }

    return () => {
      cancelled = true
      requestAc?.abort()
      lockChannel?.close()
      window.removeEventListener(ATHLETE_VIEW_ENABLING_EVENT, onAthleteViewEnabling)
    }
  }, [shouldHoldLock, persistedId, lockToken])

  useEffect(() => {
    if (!isPracticeSaveable(form)) return
    if (JSON.stringify(form) === savedSnapshotRef.current && persistedId) return

    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null
      void runAutosave()
    }, AUTOSAVE_DELAY_MS)
    autosaveTimerRef.current = timer

    return () => {
      window.clearTimeout(timer)
      if (autosaveTimerRef.current === timer) {
        autosaveTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, persistedId, lockToken, autosaveVersion])


  function updateSet(index: number, patch: Partial<SetFormState>) {
    updateForm((f) => ({
      ...f,
      sets: f.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }))
  }

  function toggleTag(tag: string) {
    updateForm((f) => {
      const has = f.tags.includes(tag)
      return { ...f, tags: has ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }
    })
  }

  function addSet() {
    updateForm((f) => {
      if (f.sets.length >= MAX_PRACTICE_SETS) return f
      return {
        ...f,
        sets: [...f.sets, { ...emptySet, dragId: createSetDragId() }],
      }
    })
  }

  function confirmSetDeletion() {
    const pendingDeletion = setPendingDeletion
    if (!pendingDeletion) return
    updateForm((f) => {
      if (f.sets.length <= 1) return f
      return { ...f, sets: removeSetKeepingRows(f.sets, pendingDeletion.dragId).sets }
    })
    setSetPendingDeletion(null)
  }
  /** Index 0 always starts a row; otherwise treat a missing flag as true (its own row). */
  function normalizeRowFlags(sets: SetFormState[]): SetFormState[] {
    return sets.map((set, index) => ({
      ...set,
      startsNewRow: index === 0 || set.startsNewRow !== false,
    }))
  }

  /** Groups sets (in order) into rows, joining consecutive `startsNewRow: false` sets. */
  function buildSetRows(sets: SetFormState[]): { set: SetFormState; index: number }[][] {
    const rows: { set: SetFormState; index: number }[][] = []
    sets.forEach((set, index) => {
      if (index === 0 || set.startsNewRow !== false) rows.push([])
      rows[rows.length - 1].push({ set, index })
    })
    return rows
  }

  /** Removes a set by key, promoting its immediate follower to row-leader if it was one. */
  function removeSetKeepingRows(
    sets: SetFormState[],
    key: string
  ): { sets: SetFormState[]; removed: SetFormState | null } {
    const working = normalizeRowFlags(sets)
    const index = working.findIndex((set) => (set.dragId ?? set.id) === key)
    if (index < 0) return { sets, removed: null }
    const [removed] = working.splice(index, 1)
    if (removed.startsNewRow && index < working.length && working[index].startsNewRow === false) {
      working[index] = { ...working[index], startsNewRow: true }
    }
    return { sets: normalizeRowFlags(working), removed }
  }

  /**
   * Moves the set `sourceKey` next to `targetKey`. Dropping on the target's left/right
   * half joins its row (as leader or follower); top/bottom relocates the whole row.
   */
  function moveSetTo(
    sets: SetFormState[],
    sourceKey: string,
    targetKey: string,
    zone: SetDropZone
  ): SetFormState[] {
    if (sourceKey === targetKey) return sets
    const { sets: withoutSource, removed: source } = removeSetKeepingRows(sets, sourceKey)
    if (!source) return sets
    const targetIndex = withoutSource.findIndex((set) => (set.dragId ?? set.id) === targetKey)
    if (targetIndex < 0) return sets
    const working = [...withoutSource]

    if (zone === "left" || zone === "right") {
      const isTargetLeader = working[targetIndex].startsNewRow
      if (zone === "left") {
        if (isTargetLeader) working[targetIndex] = { ...working[targetIndex], startsNewRow: false }
        working.splice(targetIndex, 0, { ...source, startsNewRow: isTargetLeader })
      } else {
        working.splice(targetIndex + 1, 0, { ...source, startsNewRow: false })
      }
    } else {
      let rowStart = targetIndex
      while (rowStart > 0 && working[rowStart].startsNewRow === false) rowStart--
      let rowEnd = targetIndex
      while (rowEnd + 1 < working.length && working[rowEnd + 1].startsNewRow === false) rowEnd++
      const insertAt = zone === "top" ? rowStart : rowEnd + 1
      working.splice(insertAt, 0, { ...source, startsNewRow: true })
    }

    return normalizeRowFlags(working)
  }

  /**
   * Finds the set card nearest the pointer rather than the one strictly under it, so
   * there's no dead zone in the gaps between/around cards where a drag would do nothing.
   */
  function getSetDropInfo(clientX: number, clientY: number): { key: string; zone: SetDropZone } | null {
    const cards = setsSectionRef.current?.querySelectorAll<HTMLElement>("[data-practice-set-id]")
    if (!cards || cards.length === 0) return null

    const sourceKey = draggedSetKeyRef.current
    let closestKey: string | null = null
    let closestRect: DOMRect | null = null
    let closestDist = Infinity
    for (const card of cards) {
      const key = card.dataset.practiceSetId
      // Skip the card being dragged — it's never a valid drop target, and leaving it in
      // the running would let it win ties in the gap around its own (ghosted) position.
      if (!key || key === sourceKey) continue
      const rect = card.getBoundingClientRect()
      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
      const dist = dx * dx + dy * dy
      if (dist < closestDist) {
        closestDist = dist
        closestKey = key
        closestRect = rect
      }
    }
    if (!closestKey || !closestRect) return null

    const xRatio = closestRect.width > 0 ? (clientX - closestRect.left) / closestRect.width : 0.5
    if (xRatio < 0.25) return { key: closestKey, zone: "left" }
    if (xRatio > 0.75) return { key: closestKey, zone: "right" }
    const yRatio = closestRect.height > 0 ? (clientY - closestRect.top) / closestRect.height : 0.5
    return { key: closestKey, zone: yRatio < 0.5 ? "top" : "bottom" }
  }

  function updateSetDropTarget(clientX: number, clientY: number) {
    const sourceKey = draggedSetKeyRef.current
    if (!sourceKey) return
    const info = getSetDropInfo(clientX, clientY)
    const nextTarget = info && info.key !== sourceKey ? info.key : null
    const nextZone = nextTarget ? info!.zone : null
    dropTargetSetKeyRef.current = nextTarget
    dropZoneRef.current = nextZone
    setDropTargetSetKey((current) => (current === nextTarget ? current : nextTarget))
    setDropZone((current) => (current === nextZone ? current : nextZone))
  }

  function captureSetRowPositions(): Map<string, DOMRect> {
    return new Map(
      [...setRowRefs.current].map(([dragId, row]) => [
        dragId,
        row.getBoundingClientRect(),
      ]),
    )
  }

  function animateSetReorder(previousPositions: Map<string, DOMRect>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    window.requestAnimationFrame(() => {
      for (const [dragId, previous] of previousPositions) {
        const row = setRowRefs.current.get(dragId)
        if (!row) continue
        const offsetY = previous.top - row.getBoundingClientRect().top
        if (Math.abs(offsetY) < 1) continue
        row.getAnimations().forEach((animation) => animation.cancel())
        row.animate(
          [
            {
              transform: `translateY(${offsetY}px)`,
              backgroundColor:
                "color-mix(in srgb, var(--brand-color-primary) 18%, transparent)",
            },
            { transform: "translateY(0)", backgroundColor: "transparent" },
          ],
          { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        )
      }
    })
  }

  // Edge-scroll while dragging a set near the top/bottom of the viewport, like
  // dragging a card in Trello/Notion/etc — the page scrolls so you can drop further
  // up or down than what's currently visible.
  const AUTO_SCROLL_EDGE_PX = 80
  const AUTO_SCROLL_MAX_SPEED = 18

  function computeAutoScrollSpeed(clientY: number): number {
    const viewportHeight = window.innerHeight
    if (clientY < AUTO_SCROLL_EDGE_PX) {
      const intensity = (AUTO_SCROLL_EDGE_PX - clientY) / AUTO_SCROLL_EDGE_PX
      return -Math.ceil(intensity * AUTO_SCROLL_MAX_SPEED)
    }
    if (clientY > viewportHeight - AUTO_SCROLL_EDGE_PX) {
      const intensity = (clientY - (viewportHeight - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX
      return Math.ceil(intensity * AUTO_SCROLL_MAX_SPEED)
    }
    return 0
  }

  function autoScrollTick() {
    const speed = autoScrollSpeedRef.current
    if (speed === 0) {
      autoScrollRafRef.current = null
      return
    }
    window.scrollBy(0, speed)
    // The page moved under a stationary cursor, so the hovered drop target needs
    // recomputing even without a fresh pointermove event.
    updateSetDropTarget(lastPointerRef.current.x, lastPointerRef.current.y)
    autoScrollRafRef.current = window.requestAnimationFrame(autoScrollTick)
  }

  function updateAutoScroll(clientX: number, clientY: number) {
    lastPointerRef.current = { x: clientX, y: clientY }
    autoScrollSpeedRef.current = computeAutoScrollSpeed(clientY)
    if (autoScrollSpeedRef.current !== 0 && autoScrollRafRef.current == null) {
      autoScrollRafRef.current = window.requestAnimationFrame(autoScrollTick)
    }
  }

  function stopAutoScroll() {
    autoScrollSpeedRef.current = 0
    if (autoScrollRafRef.current != null) {
      window.cancelAnimationFrame(autoScrollRafRef.current)
      autoScrollRafRef.current = null
    }
  }

  function handleSetPointerDown(event: PointerEvent<HTMLButtonElement>, dragId: string) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    draggedSetKeyRef.current = dragId
    setDraggedSetKey(dragId)
    setDropTargetSetKey(null)
    dropTargetSetKeyRef.current = null
    setDropZone(null)
    dropZoneRef.current = null
  }

  function handleSetPointerMove(event: PointerEvent<HTMLButtonElement>) {
    updateSetDropTarget(event.clientX, event.clientY)
    updateAutoScroll(event.clientX, event.clientY)
  }

  function handleSetPointerUp(event: PointerEvent<HTMLButtonElement>) {
    stopAutoScroll()
    const sourceKey = draggedSetKeyRef.current
    const info =
      dropTargetSetKeyRef.current && dropZoneRef.current
        ? { key: dropTargetSetKeyRef.current, zone: dropZoneRef.current }
        : getSetDropInfo(event.clientX, event.clientY)
    if (sourceKey && info && info.key !== sourceKey) {
      const previousPositions = captureSetRowPositions()
      updateForm((current) => ({
        ...current,
        sets: moveSetTo(current.sets, sourceKey, info.key, info.zone),
      }))
      animateSetReorder(previousPositions)
    }
    draggedSetKeyRef.current = null
    dropTargetSetKeyRef.current = null
    dropZoneRef.current = null
    setDraggedSetKey(null)
    setDropTargetSetKey(null)
    setDropZone(null)
  }

  function handleSetPointerCancel() {
    stopAutoScroll()
    draggedSetKeyRef.current = null
    dropTargetSetKeyRef.current = null
    dropZoneRef.current = null
    setDraggedSetKey(null)
    setDropTargetSetKey(null)
    setDropZone(null)
  }
  async function handleCancel() {
    if (unsavedChangesRef.current) {
      const nextPath = slugRef.current ? practicePath(slugRef.current) : null
      if (nextPath && nextPath !== window.location.pathname) {
        window.location.assign(nextPath)
      } else {
        window.location.reload()
      }
      return
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    await autosavePromiseRef.current?.catch(() => undefined)
    if (isUntouchedDraft()) {
      await deleteUntouchedDraft()
      slugRef.current = null
      persistedIdRef.current = null
      leaveEditor(null)
      return
    }
    await releaseLock()
    leaveEditor()
  }

  function save(published: boolean) {
    if (exiting) return
    const snapshot = formRef.current
    if (!isPracticeSaveable(snapshot)) return
    const id = persistedIdRef.current
    if (!id) return

    unsavedChangesRef.current = false
    setExiting(true)
    const nextPath = practicePath(slugRef.current ?? id)
    const nextSlug = slugRef.current ?? id
    void (async () => {
      if (snapshot.published !== published) {
        await fetch(`/api/practices/${id}`, {
          method: "PATCH",
          keepalive: true,
          headers: lockHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ...JSON.parse(savedSnapshotRef.current), published }),
        }).catch(() => undefined)
      }
      await releaseLock()
      if (onCancel) {
        onCancel(nextSlug)
        return
      }
      router.replace(nextPath)
    })()
  }
  function requestSave(published: boolean) {
    const currentlyPublished = form.published === true
    if (currentlyPublished !== published) {
      setConfirmPublishState(published)
      return
    }
    save(published)
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    save(false)
  }
  const missingDate = !form.date.trim()
  const missingStartTime = !form.startTime.trim()
  const missingEndTime = !form.endTime.trim()
  const missingLocation = !form.location.trim()
  const endBeforeStart =
    !missingStartTime &&
    !missingEndTime &&
    (clockToMinutes(form.endTime) ?? 0) < (clockToMinutes(form.startTime) ?? 0)
  const canSave = isPracticeSaveable(form)
  const waitingForAutosave = !persistedId || isDirty || autosaveState === "saving"
  const canPublishOrDraft = canSave && !waitingForAutosave
  const draftButtonLabel = form.published === true ? "Revert to Draft" : "Keep As Draft"
  const autosaveMessage = !hasEditedContent
    ? "Make edits to save changes."
    : autosaveState === "saving"
      ? "Saving changes…"
      : autosaveState === "error"
        ? "Autosave failed — make a change to retry."
        : isDirty && !canSave
          ? "Required fields needed to save changes."
          : isDirty
            ? "Saving changes…"
            : persistedId
              ? "All changes saved."
              : "Required fields needed to save changes."

  // Measures the bar's actual DOM layout (real width once its content is
  // unconstrained), which only exists after paint — genuinely requires an
  // effect, not state derivable from props/render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    if (!barOverContent) {
      setBarMaxWidth("100%")
      return
    }
    const previousMaxWidth = bar.style.maxWidth
    bar.style.maxWidth = "max-content"
    const compactWidth = Math.ceil(bar.getBoundingClientRect().width)
    bar.style.maxWidth = previousMaxWidth
    const frame = window.requestAnimationFrame(() => {
      setBarMaxWidth(compactWidth + "px")
    })
    return () => window.cancelAnimationFrame(frame)
  }, [barOverContent, autosaveMessage, error])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (exiting) {
    return <PracticeViewSkeleton />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-6">
      <header className="space-y-2">
        <button
          type="button"
          onClick={handleCancel}
          className="text-sm font-medium text-foreground-tertiary transition hover:text-foreground"
        >
          {persistedId ? "← Back to practice" : "← All practices"}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            <input
              aria-label="Practice title"
              placeholder="Untitled Practice"
              value={form.title}
              onChange={(e) => updateForm((form) => ({ ...form, title: e.target.value }))}
              className="w-full min-w-0 appearance-none rounded-lg border border-border bg-transparent px-3 py-1.5 text-inherit outline-none placeholder:text-foreground-tertiary focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </h1>
          <span className="rounded-full bg-primary/20 dark:bg-primary/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-active shadow-sm dark:text-primary-hover shrink-0">
            {persistedId ? "Editing" : "New practice"}
          </span>
        </div>

        <div className="mt-2 space-y-2 text-foreground-secondary sm:text-base">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-1.5 sm:flex-[0.85] sm:basis-0">
              <InfoIcon kind="calendar" />
              <label className="sr-only" htmlFor="practice-date">Practice date</label>
              <div id="practice-date" className="min-w-0 flex-1">
                <DatePicker
                  value={form.date}
                  onChange={(value) => updateForm((form) => ({ ...form, date: value }))}
                  ariaLabel="Practice date"
                  hasError={missingDate}
                  required
                />
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2 sm:flex-[1.15] sm:basis-0">
              <span className="sr-only">Practice time</span>
              <div className="min-w-0 flex-1 [&>div]:w-full">
                <TimePicker
                  value={form.startTime}
                  onChange={(value) =>
                    updateForm((current) => ({
                      ...current,
                      startTime: value,
                      endTime: value ? endOnOrAfterStart(value, current.endTime) : current.endTime,
                    }))
                  }
                  ariaLabel="Practice start time"
                  hasError={missingStartTime}
                  clearable={false}
                />
              </div>
              <span className="shrink-0 text-sm text-foreground-tertiary">to</span>
              <div className="min-w-0 flex-1 [&>div]:w-full">
                <TimePicker
                  value={form.endTime}
                  onChange={(value) =>
                    updateForm((current) => ({
                      ...current,
                      endTime:
                        current.startTime && value && (clockToMinutes(value) ?? 0) < (clockToMinutes(current.startTime) ?? 0)
                          ? endOnOrAfterStart(current.startTime)
                          : value,
                    }))
                  }
                  ariaLabel="Practice end time"
                  hasError={missingEndTime || endBeforeStart}
                  clearable={false}
                  min={form.startTime || undefined}
                />
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 sm:flex-[1.15] sm:basis-0">
              <label className="sr-only" htmlFor="practice-timezone">Practice time zone</label>
              <div id="practice-timezone" className="min-w-0 flex-1">
                <TimeZonePicker
                  value={form.timeZone}
                  onChange={(value) => updateForm((current) => ({ ...current, timeZone: value }))}
                  ariaLabel="Practice time zone"
                />
              </div>
            </div>
          </div>
          {endBeforeStart && (
            <p className="text-xs text-red-600 dark:text-red-400">End time must be after start time.</p>
          )}

          <div className="flex min-w-0 items-center gap-1.5">
            <InfoIcon kind="location" />
            <label className="sr-only" htmlFor="practice-location">Practice location</label>
            <input
              id="practice-location"
              required
              placeholder="Practice location"
              value={form.location}
              onChange={(e) => updateForm((form) => ({ ...form, location: e.target.value }))}
              aria-invalid={missingLocation || undefined}
              className={`min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 ${
                missingLocation
                  ? "border-error focus:border-error focus:ring-error/10"
                  : "border-border focus:border-primary focus:ring-primary/10"
              }`}
            />
          </div>
        </div>
      </header>

      <section className="rounded-2xl border-l-[3px] border-l-primary bg-background px-4 py-3 sm:px-5 sm:py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className={labelCls} htmlFor="practice-focus">Focus / Notes</label>
        </div>
        <div id="practice-focus">
          <RichTextField
            rows={1}
            value={form.focus}
            onChange={(focus) => updateForm((form) => ({ ...form, focus }))}
            className="bg-background"
          />
        </div>

        <div aria-labelledby="practice-tags-heading" className="mt-3 space-y-2">
          <h2 id="practice-tags-heading" className={labelCls}>Tags</h2>
          {availableTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => {
                const active = form.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs transition-colors " +
                      (active
                        ? "border-primary bg-primary text-primary-text"
                        : "border-border-secondary text-foreground-secondary hover:bg-fill-secondary")
                    }
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-foreground-tertiary">No shared tags have been added yet. Manage tags from the Practices page.</p>
          )}
        </div>
      </section>
      <section ref={setsSectionRef} className="rounded-2xl border border-border bg-background shadow-sm">
        <div>
          {buildSetRows(form.sets).map((row, rowIndex) => {
            const rowKeys = row.map(
              ({ set, index }) => set.dragId ?? set.id ?? "set-" + index
            )
            const rowEdge =
              dropTargetSetKey != null && rowKeys.includes(dropTargetSetKey)
                ? dropZone === "top" || dropZone === "bottom"
                  ? dropZone
                  : null
                : null

            return (
            <div
              key={row[0].set.dragId ?? row[0].set.id ?? "row-" + rowIndex}
              className={
                "relative px-4 py-4 first:pt-4 last:pb-1 sm:px-5 sm:first:pt-5 sm:last:pb-1 " +
                (row.length > 1 ? "grid gap-3" : "")
              }
              style={
                row.length > 1
                  ? { gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }
                  : undefined
              }
            >
              {rowEdge && (
                <>
                  <span
                    className={
                      "pointer-events-none absolute inset-x-4 z-20 h-[3px] rounded-full bg-primary sm:inset-x-5 " +
                      (rowEdge === "top" ? "-top-[7px]" : "-bottom-[7px]")
                    }
                  />
                  <span
                    className={
                      "pointer-events-none absolute left-4 z-20 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold leading-none text-primary-text shadow-sm sm:left-5 " +
                      (rowEdge === "top" ? "-top-[26px]" : "-bottom-[26px]")
                    }
                  >
                    New row {rowEdge === "top" ? "above" : "below"}
                  </span>
                </>
              )}
              {row.map(({ set, index }) => {
                const dragId = set.dragId ?? set.id ?? "set-" + index
                const isDragging = draggedSetKey === dragId
                const isDropTarget = dropTargetSetKey === dragId && !isDragging
                const sideEdge =
                  isDropTarget && (dropZone === "left" || dropZone === "right")
                    ? dropZone
                    : null
                const targetFieldClass = isDropTarget
                  ? "border-primary/50 bg-primary/5 focus:ring-primary/20"
                  : ""

                return (
                  <section
                    key={dragId}
                    ref={(element) => {
                      if (element) setRowRefs.current.set(dragId, element)
                      else setRowRefs.current.delete(dragId)
                    }}
                    data-practice-set-id={dragId}
                    className={
                      "relative rounded-xl p-2 -m-2 transition-[background-color,box-shadow,opacity] " +
                      (isDragging ? "opacity-40 " : "") +
                      (isDropTarget
                        ? "bg-primary/10 shadow-[inset_0_0_0_1px] shadow-primary/30 "
                        : "")
                    }
                  >
                    {sideEdge && (
                      <>
                        <span
                          className={
                            "pointer-events-none absolute inset-y-2 z-20 w-[3px] rounded-full bg-primary " +
                            (sideEdge === "left" ? "-left-1.5" : "-right-1.5")
                          }
                        />
                        <span
                          className={
                            "pointer-events-none absolute -top-[26px] z-20 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold leading-none text-primary-text shadow-sm " +
                            (sideEdge === "left" ? "left-1" : "right-1")
                          }
                        >
                          Side-by-side
                        </span>
                      </>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-primary-active dark:text-primary-hover">Set Name</label>
                        <input
                          placeholder="Set"
                          value={set.title}
                          onChange={(event) => updateSet(index, { title: event.target.value })}
                          className={inputCls + " " + targetFieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Distance (yards)</label>
                        <input
                          type="number"
                          min={0}
                          step={25}
                          value={set.distance}
                          onChange={(event) => updateSet(index, { distance: event.target.value })}
                          className={inputCls + " " + targetFieldClass}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onPointerDown={(event) => handleSetPointerDown(event, dragId)}
                          onPointerMove={handleSetPointerMove}
                          onPointerUp={handleSetPointerUp}
                          onPointerCancel={handleSetPointerCancel}
                          onLostPointerCapture={handleSetPointerCancel}
                          className="group relative grid h-9 w-8 touch-none select-none cursor-grab place-items-center rounded-lg text-foreground-tertiary transition-colors hover:bg-fill-secondary hover:text-foreground active:cursor-grabbing focus-visible:bg-fill-secondary focus-visible:outline-none"
                          aria-label={"Drag " + (set.title || "set " + (index + 1)) + " to reorder, or next to another set"}
                        >
                          <span aria-hidden="true" className="text-xl leading-none tracking-tighter">⠿</span>
                          {!isDragging && <HoverDetail label="Reorganize" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSetPendingDeletion({ dragId, title: set.title })}
                          disabled={form.sets.length === 1}
                          aria-label="Delete set"
                          className="group relative grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-30 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <ActionIcon kind="delete" className="h-4 w-4" />
                          <HoverDetail label="Delete" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className={labelCls}>Workout</label>
                      <RichTextField
                        rows={4}
                        value={set.content}
                        onChange={(content) => updateSet(index, { content })}
                        className={"bg-background " + targetFieldClass}
                      />
                    </div>
                  </section>
                )
              })}
            </div>
            )
          })}
        </div>
        <div ref={barContentEndRef} className="mx-4 mb-4 mt-1 sm:mx-5 sm:mb-4">
          <button
            type="button"
            onClick={addSet}
            disabled={form.sets.length >= MAX_PRACTICE_SETS}
            title={form.sets.length >= MAX_PRACTICE_SETS ? `Maximum of ${MAX_PRACTICE_SETS} sets reached` : undefined}
            className="w-full rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add set
          </button>
        </div>
      </section>

      <div
        ref={barRef}
        style={{ maxWidth: barMaxWidth }}
        className="sticky bottom-4 z-20 mx-auto w-full rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-lg shadow-black/5 backdrop-blur transition-[max-width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-5"
      >
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div
          className={
            "flex gap-3 " +
            (barOverContent
              ? "items-center justify-between"
              : "flex-col sm:flex-row sm:items-center sm:gap-4")
          }
        >
          <p aria-live="polite" className="whitespace-nowrap text-xs text-foreground-tertiary sm:shrink-0">
            {autosaveMessage}
          </p>
          <div
            className={
              barOverContent
                ? "ml-auto flex shrink-0 gap-2"
                : "flex w-full flex-col-reverse gap-2 sm:flex-1 sm:flex-row sm:gap-3"
            }
          >
            <button
              type="button"
              onClick={() => requestSave(false)}
              disabled={!canPublishOrDraft}
              aria-label={barOverContent ? draftButtonLabel : undefined}
              title={waitingForAutosave ? "Wait until changes are saved" : undefined}
              className={
                barOverContent
                  ? "group relative grid h-10 w-10 place-items-center rounded-lg border border-border-secondary text-foreground transition-colors hover:bg-fill-secondary disabled:opacity-50"
                  : "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary disabled:opacity-50"
              }
            >
              {barOverContent ? (
                <>
                  <ActionIcon kind="check" className="h-4 w-4" />
                  <span className="sr-only">{draftButtonLabel}</span>
                  <HoverDetail label={draftButtonLabel} />
                </>
              ) : (
                <>
                  <ActionIcon kind="check" className="h-4 w-4" />
                  <span>{draftButtonLabel}</span>
                </>
              )}

            </button>
            <button
              type="button"
              onClick={() => requestSave(true)}
              disabled={!canPublishOrDraft}
              aria-label={barOverContent ? "Publish practice" : undefined}
              title={waitingForAutosave ? "Wait until changes are saved" : undefined}
              className={
                barOverContent
                  ? "group relative grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-text transition-colors hover:bg-primary-hover disabled:opacity-50"
                  : "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
              }
            >
              {barOverContent ? (
                <>
                  <ActionIcon kind="publish" className="h-4 w-4" />
                  <span className="sr-only">Publish</span>
                  <HoverDetail label="Publish" />
                </>
              ) : (
                <>
                  <ActionIcon kind="publish" className="h-4 w-4" />
                  <span>Publish</span>
                </>
              )}

            </button>
          </div>
        </div>
      </div>
      <Modal
        open={setPendingDeletion != null}
        onClose={() => setSetPendingDeletion(null)}
        title="Delete set"
        description={
          <>
            Delete <span className="font-medium text-foreground">{setPendingDeletion?.title || "this set"}</span>? This cannot be undone.
          </>
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setSetPendingDeletion(null)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSetDeletion}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700"
            >
              Delete
            </button>
          </ModalFooter>
        }
      />
      <Modal
        open={confirmPublishState != null}
        onClose={() => setConfirmPublishState(null)}
        title={
          confirmPublishState ? (
            <>Publish <span className="font-medium text-foreground">{form.title.trim() || "Untitled Practice"}</span>?</>
          ) : (
            <>Revert <span className="font-medium text-foreground">{form.title.trim() || "Untitled Practice"}</span> to draft?</>
          )
        }
        description={
          confirmPublishState
            ? "This will make it visible to all athletes."
            : "This will hide it from athletes until it's published again."
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmPublishState(null)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const next = confirmPublishState
                setConfirmPublishState(null)
                if (next != null) save(next)
              }}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover"
            >
              {confirmPublishState ? "Publish" : "Revert to Draft"}
            </button>
          </ModalFooter>
        }
      />
    </form>
  )
}
