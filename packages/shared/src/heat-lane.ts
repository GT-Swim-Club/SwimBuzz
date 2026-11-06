import type { SummaryRoundKind } from "./roster-summary-sessions"

/** A roster summary row's heat & lane (and round): what a coach can fill in where no import has it. */
export type HeatLaneFields = {
  heat?: number
  /** Heats in the event's round ("Heat 2 of 4"). */
  heatTotal?: number
  lane?: number
  /** Heat start time, "03:19 PM" like the heat sheets. */
  startTime?: string
  /** The round, for a row no import has given one (kept on its T round). */
  round?: SummaryRoundKind
}

/** Coach-added heat & lane per round (P prelims, F finals, T timed finals or an unknown round). */
export type CoachHeatLane = Partial<Record<SummaryRoundKind, HeatLaneFields>>

/** One row's coach heat & lane; a null or missing field clears it. */
export type SetHeatLaneInput = {
  kind: "individual" | "relay"
  /** Individual rows. */
  athleteId?: string
  event: string
  /** Relay rows. */
  relayLetter?: string | null
  gender?: string | null
  slot: SummaryRoundKind
  heat?: number | null
  heatTotal?: number | null
  lane?: number | null
  startTime?: string | null
  round?: SummaryRoundKind | null
}

/** Highest heat, heats-in-event and lane number a coach can enter. */
export const HEAT_LANE_MAX = 99

/**
 * A typed start time as the heat sheets print it ("9:5 pm" → "09:05 PM", "14:05" → "02:05 PM").
 * "" when blank, null when it isn't a time.
 */
export function normalizeHeatStartTime(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim()
  if (!text) return ""
  const m = text.match(/^(\d{1,2})(?::(\d{1,2}))?\s*([ap])\.?\s*m?\.?$/i) ?? text.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  let hour = Number(m[1])
  const minute = Number(m[2] ?? 0)
  const meridiem = m[3]?.toUpperCase()
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null
  let suffix: "AM" | "PM"
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    suffix = meridiem === "P" ? "PM" : "AM"
  } else {
    if (hour > 23) return null
    suffix = hour >= 12 ? "PM" : "AM"
    hour = hour % 12 || 12
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`
}
