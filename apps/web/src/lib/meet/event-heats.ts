import { sessionRound } from "@swimbuzz/shared"
import type { EventOrder, EventOrderRow } from "@/lib/meet/meet-event-order"
import { isSheetSummary, type EventHeats } from "@/lib/meet/meet-sheet-summary"

/** An order-of-events row with each event's heat count, where a heat sheet gives one. */
export type EventOrderRowWithHeats = EventOrderRow & { womenHeats?: number; menHeats?: number }

export type EventOrderWithHeats = {
  sessions: Array<{ label: string; rows: EventOrderRowWithHeats[] }>
}

/**
 * A heat sheet summary's heat counts: the sheet's own for every event, with our entries'
 * "of N" filling in for summaries imported before the sheet's counts were kept.
 */
function sheetEventHeats(summary: unknown): EventHeats {
  if (!isSheetSummary(summary)) return {}
  const fromEntries: EventHeats = {}
  for (const entry of summary.entries) {
    const heats = entry.heatTotal ?? entry.prelimHeatTotal ?? entry.finalHeatTotal
    if (entry.eventNumber > 0 && heats != null && heats > 0) {
      fromEntries[entry.eventNumber] = Math.max(fromEntries[entry.eventNumber] ?? 0, heats)
    }
  }
  return { ...fromEntries, ...(summary.eventHeats ?? {}) }
}

/**
 * The order of events with each row's women's and men's heat counts: a prelims session's from the
 * prelims heat sheets, a finals session's from the finals heat sheets, and a session holding
 * every round (timed finals, "Saturday") from either, prelims first.
 */
export function eventOrderWithHeats(
  order: EventOrder,
  sheets: { heatSheetSummary: unknown; finalsHeatSheetSummary: unknown }
): EventOrderWithHeats {
  const prelims = sheetEventHeats(sheets.heatSheetSummary)
  const finals = sheetEventHeats(sheets.finalsHeatSheetSummary)
  const count = (heats: EventHeats, eventNumber: number | null) =>
    eventNumber != null ? heats[eventNumber] : undefined
  return {
    sessions: order.sessions.map((session) => {
      const round = sessionRound(session.label)
      const heats = round === "P" ? prelims : round === "F" ? finals : { ...finals, ...prelims }
      return {
        ...session,
        rows: session.rows.map((row) => {
          const womenHeats = count(heats, row.women)
          const menHeats = count(heats, row.men)
          return {
            ...row,
            ...(womenHeats != null ? { womenHeats } : {}),
            ...(menHeats != null ? { menHeats } : {}),
          }
        }),
      }
    }),
  }
}
