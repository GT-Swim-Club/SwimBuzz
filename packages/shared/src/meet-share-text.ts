/**
 * Plain-text copies of the meet exports (roster summary, relays), for pasting into a group chat:
 * the meet name, the export's heading, date & location, then each section with indented rows.
 */

import { rosterNameFirstLast, rosterNamePreferred } from "./format"
import type { MeetHeaderDetails } from "./meet-header"
import { relayLineupRoundLabel } from "./relay-lineups"
import { relayShareTime, type RelayShareEvent } from "./relay-share"
import type { RosterSummaryPdfRequest, RosterSummaryPdfResult, RosterSummaryPdfRow } from "./roster-summary-pdf"

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`
}

/** Swim times with two decimals ("58.3" → "58.30", "1:5.2" → "1:05.20"); other text unchanged. */
function displayTime(time: string): string {
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(time.trim())
  if (!match) return time.trim()
  const seconds = Number(match[2]).toFixed(2)
  return match[1] != null ? `${Number(match[1])}:${seconds.padStart(5, "0")}` : seconds
}

/** The meet name, the export's heading, then date & location. */
function headerLines(meetName: string, heading: string, details: MeetHeaderDetails): string[] {
  return [meetName, heading, [details.date, details.location].filter(Boolean).join(" · ")].filter(Boolean)
}

/** "1:23.47 (−0.15, 5th)", "Seed 1:37.66 (1st)", "DQ". */
function resultText(result: RosterSummaryPdfResult | undefined): string | null {
  if (!result || result.kind === "none") return null
  if (result.kind === "text") return result.text
  if (result.kind === "seed") {
    const seed = result.seed === "NT" ? "NT" : displayTime(result.seed)
    return `Seed ${seed}${result.seedRank != null ? ` (${ordinal(result.seedRank)})` : ""}`
  }
  const main = result.time ? displayTime(result.time) : result.status ?? "—"
  const extra = [result.delta?.replace(/^-/, "−"), result.place != null ? ordinal(result.place) : null].filter(Boolean)
  return extra.length ? `${main} (${extra.join(", ")})` : main
}

/** A legs line in last names, each with its split: "Ukic 25.31, Wang 25.80, Fulton, Plantamura". */
function lastNames(legs: string[], splits?: string[]): string {
  return legs
    .map((leg, i) => {
      const split = splits?.[i] ? displayTime(splits[i]) : null
      return [rosterNamePreferred(leg).split(", ")[0], split].filter(Boolean).join(" ")
    })
    .join(", ")
}

function rosterRowLines(row: RosterSummaryPdfRow): string[] {
  const line = [
    rosterNamePreferred(row.label),
    row.sub,
    row.meta?.replace(/\s+\|\s+/g, " · "),
    row.heatLane,
    row.startTime,
    resultText(row.result),
  ]
    .filter(Boolean)
    .join(" · ")
  return row.legs?.length ? [`  ${line}`, `    ${lastNames(row.legs, row.legSplits)}`] : [`  ${line}`]
}

/** The roster summary as shown (same request as the PDF and PNG), as plain text. */
export function rosterSummaryText({
  meetName,
  details,
  request,
}: {
  meetName: string
  details: MeetHeaderDetails
  request: RosterSummaryPdfRequest
}): string {
  const sections = request.sections.map((section) =>
    [
      `${section.eventNumber ? `#${section.eventNumber} ` : ""}${rosterNamePreferred(section.title)}`,
      ...section.rows.flatMap(rosterRowLines),
    ].join("\n")
  )
  return [
    headerLines(meetName, request.heading ?? "Entries", details).join("\n"),
    ...(sections.length ? sections : ["No entries match these filters."]),
  ].join("\n\n")
}

/** The published relays as plain text: each event, its relays, and their legs in order. */
export function relayShareText({
  meetName,
  details,
  events,
}: {
  meetName: string
  details: MeetHeaderDetails
  events: RelayShareEvent[]
}): string {
  const sections = events.map((event) =>
    [
      `${event.number ? `#${event.number} ` : ""}${event.name}`,
      ...event.relays.flatMap((relay) => {
        const time = relayShareTime(relay)
        const line = [
          `${relay.letter} Relay`,
          relayLineupRoundLabel(relay.round),
          time ? `${displayTime(time)}${relay.place != null ? ` (${ordinal(relay.place)})` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
        return [
          `  ${line}`,
          ...relay.legs.map(
            (leg) => `    ${leg.leg}. ${rosterNameFirstLast(leg.name)}${leg.stroke ? ` (${leg.stroke})` : ""}`
          ),
        ]
      }),
    ].join("\n")
  )
  return [headerLines(meetName, "Relays", details).join("\n"), ...sections].join("\n\n")
}
