import type { EventOrder } from "@/lib/meet/meet-event-order"
import { isEventOrder } from "@/lib/meet/meet-event-order"
import type { SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { formatDisplayTime } from "@/lib/utils"

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

export function eventNumberForGender(
  option: Pick<MeetSignupEventOption, "women" | "men">,
  gender: "M" | "F" | null | undefined
): number | null {
  if (gender === "F") return option.women
  if (gender === "M") return option.men
  return option.women ?? option.men
}

export function isRelaySignupEvent(event: string): boolean {
  return /\brelay\b/i.test(event.trim())
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
  // Entries-report rows are seed-only too, so check the import flag first.
  if (entry.entriesImport === true) return false
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
 * Based on entriesSheetSummary seeds, excluding psych/heat/imported rows.
 */
export function resolveEditableSignupSheetKeys(
  entriesSummary: SheetSummary | null | undefined,
  psychSummary: SheetSummary | null | undefined,
  heatSummary: SheetSummary | null | undefined
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
