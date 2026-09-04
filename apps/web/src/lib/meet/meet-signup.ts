import type { EventOrder } from "@/lib/meet/meet-event-order"
import { isEventOrder } from "@/lib/meet/meet-event-order"
import type { SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { formatDateTime, formatDisplayTime } from "@/lib/utils"

export const MEET_SIGNUP_INDIVIDUAL_EVENTS = [
  "50 Free",
  "100 Free",
  "200 Free",
  "400 Free",
  "500 Free",
  "1000 Free",
  "1650 Free",
  "100 Back",
  "200 Back",
  "100 Breast",
  "200 Breast",
  "100 Fly",
  "200 Fly",
  "200 IM",
  "400 IM",
] as const

export const MEET_SIGNUP_RELAY_EVENTS = [
  "200 Free Relay",
  "400 Free Relay",
  "800 Free Relay",
  "200 Medley Relay",
  "400 Medley Relay",
] as const

export const MEET_SIGNUP_DEFAULT_EVENTS = [
  ...MEET_SIGNUP_INDIVIDUAL_EVENTS,
  ...MEET_SIGNUP_RELAY_EVENTS,
] as const

export type MeetSignupQuestionType = "text" | "choice"

export type MeetSignupQuestion = {
  id: string
  label: string
  required: boolean
  type: MeetSignupQuestionType
  /** Answer choices when type is "choice". */
  options: string[]
}

function isQuestionType(value: unknown): value is MeetSignupQuestionType {
  return value === "text" || value === "choice"
}

export function isMeetSignupQuestions(value: unknown): value is MeetSignupQuestion[] {
  if (!Array.isArray(value)) return false
  return value.every((q) => {
    if (!q || typeof q !== "object") return false
    const item = q as Record<string, unknown>
    if (typeof item.id !== "string" || typeof item.label !== "string") return false
    if (typeof item.required !== "boolean") return false
    if (item.type !== undefined && !isQuestionType(item.type)) return false
    if (item.options !== undefined) {
      if (!Array.isArray(item.options)) return false
      if (!item.options.every((o) => typeof o === "string")) return false
    }
    return true
  })
}

export function normalizeMeetSignupQuestions(value: unknown): MeetSignupQuestion[] {
  if (!isMeetSignupQuestions(value)) return []
  return value
    .map((q) => {
      const type: MeetSignupQuestionType = q.type === "choice" ? "choice" : "text"
      const options =
        type === "choice"
          ? [...new Set((q.options ?? []).map((o) => o.trim()).filter(Boolean))]
          : []
      return {
        id: q.id.trim(),
        label: q.label.trim(),
        required: Boolean(q.required),
        type,
        options,
      }
    })
    .filter((q) => {
      if (!q.id || !q.label) return false
      if (q.type === "choice" && q.options.length < 2) return false
      return true
    })
}

export function eventsFromEventOrder(order: unknown): string[] {
  return resolveSignupEventOptions(order).map((e) => e.event)
}

export type MeetSignupEventOption = {
  event: string
  women: number | null
  men: number | null
  isRelay: boolean
}

/** Sign-up events always come from the meet packet order of events. */
export function resolveSignupEventOptions(eventOrder: unknown): MeetSignupEventOption[] {
  if (!isEventOrder(eventOrder)) return []
  const seen = new Set<string>()
  const events: MeetSignupEventOption[] = []
  for (const session of (eventOrder as EventOrder).sessions) {
    for (const row of session.rows) {
      const name = row.event.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      events.push({
        event: name,
        women: row.women,
        men: row.men,
        isRelay: isRelaySignupEvent(name),
      })
    }
  }
  return events
}

/** Sort selected events to match the meet order of events. Unknown events go last. */
export function sortSignupEventsByOrder(
  events: string[],
  order: MeetSignupEventOption[] | string[]
): string[] {
  const rank = new Map<string, number>()
  order.forEach((item, i) => {
    const name = typeof item === "string" ? item : item.event
    if (!rank.has(name)) rank.set(name, i)
  })
  return [...events].sort((a, b) => {
    const ai = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER
    const bi = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return a.localeCompare(b)
  })
}

export function eventNumberForGender(
  option: Pick<MeetSignupEventOption, "women" | "men">,
  gender: "M" | "F" | null | undefined
): number | null {
  if (gender === "F") return option.women
  if (gender === "M") return option.men
  return option.women ?? option.men
}

export function formatSignupEventLabel(
  option: MeetSignupEventOption,
  gender: "M" | "F" | null | undefined
): string {
  const num = eventNumberForGender(option, gender)
  return num != null ? `#${num} ${option.event}` : option.event
}

export function isRelaySignupEvent(event: string): boolean {
  return /\brelay\b/i.test(event.trim())
}

export function partitionSignupEvents(events: string[]): {
  individual: string[]
  relay: string[]
} {
  const individual: string[] = []
  const relay: string[] = []
  for (const event of events) {
    if (isRelaySignupEvent(event)) relay.push(event)
    else individual.push(event)
  }
  return { individual, relay }
}

export function isSignupEntryTimes(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === "string")
}

export function normalizeSignupEntryTimes(value: unknown): Record<string, string> {
  if (!isSignupEntryTimes(value)) return {}
  const out: Record<string, string> = {}
  for (const [event, time] of Object.entries(value)) {
    const key = event.trim()
    const trimmed = time.trim()
    if (key && trimmed) out[key] = trimmed
  }
  return out
}

/** Accepts NT or swim times like 58.32 / 1:02.45 (optional hundredths). */
export function isValidSignupEntryTime(input: string): boolean {
  const time = input.trim()
  if (!time) return false
  if (/^nt$/i.test(time)) return true
  if (/^\d{1,2}:[0-5]\d(?:\.\d{1,2})?$/.test(time)) return true
  if (/^\d{1,2}(?:\.\d{1,2})?$/.test(time)) {
    const seconds = Number(time)
    return Number.isFinite(seconds) && seconds > 0
  }
  return false
}

export function normalizeSignupEntryTime(input: string): string {
  const time = input.trim()
  if (/^nt$/i.test(time)) return "NT"
  if (!isValidSignupEntryTime(time)) return time
  return formatDisplayTime(time)
}

export function signupWindowStatus(opts: {
  openAt: Date | null
  closeAt: Date | null
  now?: Date
}): { open: boolean; reason: string | null } {
  const now = opts.now ?? new Date()
  if (!opts.openAt) {
    return { open: false, reason: "Sign-ups are not open yet." }
  }
  if (now < opts.openAt) {
    return { open: false, reason: `Sign-ups open ${formatDateTime(opts.openAt)}.` }
  }
  if (opts.closeAt && now > opts.closeAt) {
    return { open: false, reason: `Sign-ups closed ${formatDateTime(opts.closeAt)}.` }
  }
  return { open: true, reason: null }
}

/** Drops may stay open after sign-ups close, until withdrawUntil (or closeAt if unset). */
export function signupWithdrawStatus(opts: {
  openAt: Date | null
  closeAt: Date | null
  withdrawUntil: Date | null
  now?: Date
}): { allowed: boolean; reason: string | null; deadline: Date | null } {
  const now = opts.now ?? new Date()
  const deadline = opts.withdrawUntil ?? opts.closeAt
  if (!opts.openAt) {
    return {
      allowed: false,
      reason: "Sign-ups are not open yet.",
      deadline,
    }
  }
  if (now < opts.openAt) {
    return {
      allowed: false,
      reason: `Sign-ups open ${formatDateTime(opts.openAt)}.`,
      deadline,
    }
  }
  if (deadline && now > deadline) {
    return {
      allowed: false,
      reason: `Drops closed ${formatDateTime(deadline)}.`,
      deadline,
    }
  }
  return { allowed: true, reason: null, deadline }
}

export function isSignupAnswers(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === "string")
}

export function parseCustomQuestionAnswers(
  questions: MeetSignupQuestion[],
  rawAnswers: unknown
): { ok: true; answers: Record<string, string> } | { ok: false; error: string } {
  const raw = isSignupAnswers(rawAnswers) ? rawAnswers : {}
  const answers: Record<string, string> = {}
  for (const q of questions) {
    const value = String(raw[q.id] ?? "").trim()
    if (q.required && !value) {
      return { ok: false, error: `"${q.label}" is required` }
    }
    if (q.type === "choice" && value && !q.options.includes(value)) {
      return { ok: false, error: `Invalid answer for "${q.label}"` }
    }
    if (value) answers[q.id] = value
  }
  return { ok: true, answers }
}

export function findIncompleteChoiceQuestion(
  questions: MeetSignupQuestion[]
): MeetSignupQuestion | undefined {
  return questions.find((q) => q.type === "choice" && q.options.length < 2)
}

export type SignupEntryForSheetSync = {
  athleteId: string
  athleteName: string
  gender: "M" | "F"
  events: string[]
  entryTimes: Record<string, string>
}

/** Build individual SheetEntry rows from sign-ups (relays omitted). */
export function buildIndividualSheetEntriesFromSignups(
  signups: SignupEntryForSheetSync[],
  eventOptions: MeetSignupEventOption[]
): SheetEntry[] {
  const optionByEvent = new Map(eventOptions.map((o) => [o.event, o]))
  const entries: SheetEntry[] = []

  for (const signup of signups) {
    const { individual } = partitionSignupEvents(
      sortSignupEventsByOrder(signup.events, eventOptions)
    )
    for (const event of individual) {
      const opt = optionByEvent.get(event)
      const eventName = normalizeEventName(opt?.event ?? event)
      if (!eventName) continue
      const eventNumber = opt ? eventNumberForGender(opt, signup.gender) ?? 0 : 0
      const rawTime = signup.entryTimes[event]?.trim() ?? ""
      const normalized = rawTime ? normalizeSignupEntryTime(rawTime) : "NT"
      const row: SheetEntry = {
        athleteId: signup.athleteId,
        athleteName: signup.athleteName,
        event: eventName,
        eventNumber,
        entryType: "individual",
        // Coach sync seed — overridden by psych/entries/heat/results in merge.
        manual: true,
      }
      if (/^nt$/i.test(normalized)) {
        row.timeStatus = "NT"
      } else {
        row.seedTime = normalized
      }
      entries.push(row)
    }
  }

  return entries
}

/**
 * Add individual sign-up seeds into entriesSheetSummary.
 * Imported sheet rows (non-manual) are never replaced; matching events are skipped.
 * Relay rows and individuals for athletes without a sign-up are preserved.
 */
export function mergeSignupIndividualsIntoEntriesSummary(
  existing: SheetSummary | null | undefined,
  course: string,
  signups: SignupEntryForSheetSync[],
  eventOptions: MeetSignupEventOption[]
): { summary: SheetSummary; synced: number } {
  const syncedEntries = buildIndividualSheetEntriesFromSignups(signups, eventOptions)
  const signedUpAthletes = new Set(signups.map((s) => s.athleteId))
  const signupEventKeys = new Set(
    signups.flatMap((s) => {
      const { individual } = partitionSignupEvents(s.events)
      return individual.map((event) => sheetEntryKey(s.athleteId, event))
    })
  )

  const kept = (existing?.entries ?? []).filter((e) => {
    if (e.entryType === "relay_team") return true
    if (e.entryType === "individual" || e.entryType == null) {
      if (!signedUpAthletes.has(e.athleteId)) return true
      // Rebuild sign-up seeds (including legacy rows missing `manual`).
      if (isEditableSignupSheetSeed(e) && signupEventKeys.has(sheetEntryKey(e.athleteId, e.event))) {
        return false
      }
      // Keep imported psych/entries/heat rows — do not let sign-up sync overwrite them.
      if (!isEditableSignupSheetSeed(e)) return true
      return false
    }
    return true
  })

  const importedKeys = new Set(
    kept
      .filter((e) => e.entryType !== "relay_team" && !isEditableSignupSheetSeed(e))
      .map((e) => sheetEntryKey(e.athleteId, e.event))
  )
  const toAdd = syncedEntries.filter(
    (e) => !importedKeys.has(sheetEntryKey(e.athleteId, e.event))
  )

  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries: [...kept, ...toAdd],
    },
    synced: toAdd.length,
  }
}

function sheetEntryKey(athleteId: string, event: string): string {
  return `${athleteId}|${normalizeEventName(event)}`
}

/** True when a sheet row looks like an imported psych/heat/entries placement. */
function hasImportedSheetMarkers(entry: SheetEntry): boolean {
  return Boolean(
    entry.seedRank != null ||
      entry.heat != null ||
      entry.lane != null ||
      entry.prelimHeat != null ||
      entry.finalHeat != null ||
      entry.prelimLane != null ||
      entry.finalLane != null ||
      entry.resultTime ||
      entry.prelimTime ||
      entry.finalTime ||
      entry.resultStatus ||
      entry.prelimStatus ||
      entry.finalStatus
  )
}

/**
 * Sign-up / coach seed row in entriesSheetSummary (not a PDF import).
 * Accepts legacy synced rows that may be missing `manual: true`.
 */
export function isEditableSignupSheetSeed(entry: SheetEntry): boolean {
  if (entry.rosterOnly === true) return false
  if (entry.entryType === "relay_team" || entry.isRelayLeadoff || entry.swimId) {
    return false
  }
  if (entry.manual === true) return true
  // Legacy sync rows: seed-only, no psych/heat markers.
  return !hasImportedSheetMarkers(entry)
}

function matchesManualIndividual(
  entry: SheetEntry,
  athleteId: string,
  event: string
): boolean {
  return (
    isEditableSignupSheetSeed(entry) &&
    entry.athleteId === athleteId &&
    normalizeEventName(entry.event) === normalizeEventName(event)
  )
}

/**
 * Keys (`athleteId|event`) for roster summary individuals coaches may edit/delete.
 * Based on entriesSheetSummary seeds + sign-ups, excluding psych/heat/imported rows.
 */
export function resolveEditableSignupSheetKeys(
  entriesSummary: SheetSummary | null | undefined,
  psychSummary: SheetSummary | null | undefined,
  heatSummary: SheetSummary | null | undefined,
  signups: Array<{ athleteId: string; events: string[] }>
): string[] {
  const importedKeys = new Set<string>()
  for (const e of [
    ...(psychSummary?.entries ?? []),
    ...(heatSummary?.entries ?? []),
  ]) {
    if (e.entryType === "relay_team" || e.isRelayLeadoff) continue
    importedKeys.add(sheetEntryKey(e.athleteId, e.event))
  }
  for (const e of entriesSummary?.entries ?? []) {
    if (e.entryType === "relay_team" || e.isRelayLeadoff) continue
    if (isEditableSignupSheetSeed(e)) continue
    importedKeys.add(sheetEntryKey(e.athleteId, e.event))
  }

  const editable = new Set<string>()
  for (const e of entriesSummary?.entries ?? []) {
    if (!isEditableSignupSheetSeed(e)) continue
    const key = sheetEntryKey(e.athleteId, e.event)
    if (!importedKeys.has(key)) editable.add(key)
  }

  const sheetKeys = new Set(
    (entriesSummary?.entries ?? [])
      .filter((e) => e.entryType !== "relay_team" && !e.isRelayLeadoff)
      .map((e) => sheetEntryKey(e.athleteId, e.event))
  )

  for (const signup of signups) {
    const { individual } = partitionSignupEvents(signup.events)
    for (const event of individual) {
      const key = sheetEntryKey(signup.athleteId, event)
      if (importedKeys.has(key)) continue
      if (sheetKeys.has(key)) editable.add(key)
    }
  }

  return [...editable]
}

export function applySeedTimeToRow(row: SheetEntry, seedTimeRaw: string): SheetEntry {
  const normalized = normalizeSignupEntryTime(seedTimeRaw.trim() || "NT")
  const next: SheetEntry = { ...row }
  delete next.seedTime
  delete next.timeStatus
  if (/^nt$/i.test(normalized)) {
    next.timeStatus = "NT"
  } else {
    next.seedTime = normalized
  }
  return next
}

/**
 * Creates a new manual individual entry in entriesSheetSummary.
 */
export function createManualIndividualSheetEntry(
  existing: SheetSummary | null | undefined,
  course: string,
  opts: {
    athleteId: string
    athleteName: string
    event: string
    gender?: "M" | "F" | null
    seedTime?: string
    eventOptions?: MeetSignupEventOption[]
  }
): { summary: SheetSummary; conflict?: boolean } {
  const entries = [...(existing?.entries ?? [])]
  const eventName = normalizeEventName(opts.event)
  if (!eventName) {
    return {
      summary: {
        sheetType: existing?.sheetType ?? "psych",
        course: existing?.course || course,
        entries,
      },
      conflict: true,
    }
  }

  // Check for conflict
  if (
    entries.some(
      (e) =>
        e.entryType === "individual" &&
        e.athleteId === opts.athleteId &&
        normalizeEventName(e.event) === eventName
    )
  ) {
    return {
      summary: {
        sheetType: existing?.sheetType ?? "psych",
        course: existing?.course || course,
        entries,
      },
      conflict: true,
    }
  }

  const option = opts.eventOptions?.find(
    (o) => normalizeEventName(o.event) === eventName
  )

  let row: SheetEntry = {
    athleteId: opts.athleteId,
    athleteName: opts.athleteName,
    event: option?.event ?? eventName,
    eventNumber: option ? eventNumberForGender(option, opts.gender) ?? 0 : 0,
    manual: true,
    entryType: "individual",
  }

  if (opts.seedTime !== undefined) {
    row = applySeedTimeToRow(row, opts.seedTime)
  }

  entries.push(row)

  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries,
    },
  }
}

/**
 * Update a coach/sign-up seed row in entriesSheetSummary.
 * Only touches `manual` individuals without a swim id (not PDF/sheet imports).
 */
export function updateManualIndividualSheetEntry(
  existing: SheetSummary | null | undefined,
  course: string,
  opts: {
    athleteId: string
    event: string
    newEvent?: string
    seedTime?: string
    athleteName?: string
    gender?: "M" | "F" | null
    eventOptions?: MeetSignupEventOption[]
  }
): { summary: SheetSummary; found: boolean; conflict?: boolean } {
  const entries = [...(existing?.entries ?? [])]
  const idx = entries.findIndex((e) =>
    matchesManualIndividual(e, opts.athleteId, opts.event)
  )
  if (idx < 0) {
    return {
      summary: {
        sheetType: existing?.sheetType ?? "psych",
        course: existing?.course || course,
        entries,
      },
      found: false,
    }
  }

  const nextEventName = normalizeEventName(opts.newEvent ?? opts.event)
  if (!nextEventName) {
    return {
      summary: {
        sheetType: existing?.sheetType ?? "psych",
        course: existing?.course || course,
        entries,
      },
      found: true,
      conflict: true,
    }
  }

  if (
    normalizeEventName(opts.event) !== nextEventName &&
    entries.some(
      (e, i) =>
        i !== idx &&
        e.entryType === "individual" &&
        e.athleteId === opts.athleteId &&
        normalizeEventName(e.event) === nextEventName
    )
  ) {
    return {
      summary: {
        sheetType: existing?.sheetType ?? "psych",
        course: existing?.course || course,
        entries,
      },
      found: true,
      conflict: true,
    }
  }

  const option = opts.eventOptions?.find(
    (o) => normalizeEventName(o.event) === nextEventName
  )
  let row: SheetEntry = {
    ...entries[idx],
    event: option?.event ?? nextEventName,
    manual: true,
    entryType: "individual",
    ...(opts.athleteName ? { athleteName: opts.athleteName } : {}),
  }
  if (option) {
    row.eventNumber = eventNumberForGender(option, opts.gender) ?? row.eventNumber
  }
  if (opts.seedTime !== undefined) {
    row = applySeedTimeToRow(row, opts.seedTime)
  }
  entries[idx] = row

  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries,
    },
    found: true,
  }
}

/** Remove a coach/sign-up seed row from entriesSheetSummary. */
export function deleteManualIndividualSheetEntry(
  existing: SheetSummary | null | undefined,
  course: string,
  opts: { athleteId: string; event: string }
): { summary: SheetSummary; found: boolean } {
  const entries = existing?.entries ?? []
  const next = entries.filter(
    (e) => !matchesManualIndividual(e, opts.athleteId, opts.event)
  )
  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries: next,
    },
    found: next.length < entries.length,
  }
}

export function isRosterOnlySheetEntry(entry: SheetEntry): boolean {
  return entry.rosterOnly === true
}

export function athleteHasRosterSummaryEntry(
  entries: SheetEntry[],
  athleteId: string
): boolean {
  return entries.some(
    (e) =>
      e.athleteId === athleteId &&
      (e.entryType === "individual" || e.isRelayLeadoff || e.rosterOnly === true)
  )
}

/** Add an athlete to entriesSheetSummary without an event (attending only). */
export function createRosterOnlySheetEntry(
  existing: SheetSummary | null | undefined,
  course: string,
  opts: {
    athleteId: string
    athleteName: string
    gender?: "M" | "F" | null
  }
): { summary: SheetSummary; conflict?: boolean } {
  const entries = [...(existing?.entries ?? [])]

  if (athleteHasRosterSummaryEntry(entries, opts.athleteId)) {
    return {
      summary: {
        sheetType: existing?.sheetType ?? "psych",
        course: existing?.course || course,
        entries,
      },
      conflict: true,
    }
  }

  entries.push({
    athleteId: opts.athleteId,
    athleteName: opts.athleteName,
    event: "Attending",
    eventNumber: 0,
    entryType: "individual",
    manual: true,
    rosterOnly: true,
    gender: opts.gender ?? undefined,
  })

  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries,
    },
  }
}

export function deleteRosterOnlySheetEntry(
  existing: SheetSummary | null | undefined,
  course: string,
  athleteId: string
): { summary: SheetSummary; found: boolean } {
  const entries = existing?.entries ?? []
  const next = entries.filter(
    (e) => !(e.rosterOnly === true && e.athleteId === athleteId)
  )
  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries: next,
    },
    found: next.length < entries.length,
  }
}
