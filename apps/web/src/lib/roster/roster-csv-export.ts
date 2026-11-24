import { athleteYearForSeason } from "@swimbuzz/shared"
import { isPlaceholderEmail } from "@/lib/auth/gatech-email"
import { athleteAge } from "@/lib/utils"
import type { RosterExportAthlete } from "@/lib/roster/roster-export"

/**
 * Spreadsheet apps run a cell starting with one of these as a formula, so such cells get a leading
 * apostrophe (shown as text, not evaluated).
 */
const FORMULA_START = /^[=+\-@\t\r]/

function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** "2026-11-03" — the date as stored (UTC), which every spreadsheet reads as a date. */
function isoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : ""
}

/**
 * The roster as CSV: a row per athlete with First Name, Last Name, Preferred Name, Gender, Year
 * and Age; staff also get Email, GTID, DOB, SwimCloud ID, Physical and Concussion Test. Headers and values are the ones Import roster reads, so the file re-imports as is
 * (Age and the status columns are ignored there). UTF-8 with a BOM so Excel keeps "Ríos".
 */
export function buildRosterCsv(athletes: RosterExportAthlete[], opts: { season: string | null; staff: boolean }): string {
  const header = [
    "First Name",
    "Last Name",
    "Preferred Name",
    "Gender",
    "Year",
    "Age",
    ...(opts.staff
      ? ["Email", "GTID", "DOB", "SwimCloud ID", "Physical", "Concussion Test"]
      : []),
  ]

  const rows = athletes.map((a) => [
    a.firstName,
    a.lastName,
    a.preferredName,
    a.gender === "F" ? "Women" : "Men",
    // The year as imported or typed ("3", "Masters"), so it re-imports unchanged.
    (opts.season ? athleteYearForSeason(a, opts.season) : a.year) ?? "",
    athleteAge(a.dob),
    ...(opts.staff
      ? [
          a.email && !isPlaceholderEmail(a.email) ? a.email : "",
          a.gtid,
          isoDate(a.dob),
          // Several profiles share one cell, space-separated, main profile first.
          a.swimCloudIds.join(" "),
          a.clearance.physical.cleared ? "Complete" : "Incomplete",
          a.clearance.concussion.cleared ? "Complete" : "Incomplete",
        ]
      : []),
  ])

  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`
}
