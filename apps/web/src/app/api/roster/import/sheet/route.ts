import { NextResponse } from "next/server"
import { parseSeason } from "@/lib/season"
import { parseRosterRecords } from "@/lib/roster/roster-csv"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"
import { runRosterImport } from "@/lib/roster/roster-import"
import {
  listSheetTabs,
  readSheetValues,
  resolveTab,
  SheetAccessExpiredError,
  SheetForbiddenError,
  SheetNotFoundError,
} from "@/lib/roster/google-sheets"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : ""
  const spreadsheetId = typeof body.spreadsheetId === "string" ? body.spreadsheetId : ""
  const gid = typeof body.gid === "number" ? body.gid : undefined
  const season = parseSeason(body.season ?? body.year)

  if (!accessToken || !spreadsheetId) {
    return NextResponse.json({ error: "A picked Google Sheet is required" }, { status: 400 })
  }
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  let tabTitle: string
  let values: string[][]
  try {
    const tabs = await listSheetTabs(accessToken, spreadsheetId)
    const tab = resolveTab(tabs, gid)
    tabTitle = tab.title
    values = await readSheetValues(accessToken, spreadsheetId, tabTitle)
  } catch (err) {
    if (err instanceof SheetAccessExpiredError) {
      return NextResponse.json({ error: "Google access expired — choose the sheet again." }, { status: 400 })
    }
    if (err instanceof SheetForbiddenError) {
      return NextResponse.json({ error: "Your Google account can't open that sheet." }, { status: 400 })
    }
    if (err instanceof SheetNotFoundError) {
      return NextResponse.json({ error: "Couldn't find that Google Sheet or tab." }, { status: 400 })
    }
    console.error("Google Sheets roster import fetch failed:", err)
    return NextResponse.json({ error: "Failed to read that Google Sheet." }, { status: 502 })
  }

  const parsed = parseRosterRecords(values)

  console.log("[roster sheet import]", {
    tab: tabTitle,
    season,
    parsedRows: parsed.rows.length,
    parseErrors: parsed.errors.length})

  if (parsed.rows.length === 0 && parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0]?.message ?? "Could not parse sheet", errors: parsed.errors },
      { status: 400 }
    )
  }

  let summary
  try {
    summary = await runRosterImport(parsed.rows, season, parsed.errors)
  } catch (err) {
    console.error("Google Sheets roster import failed:", err)
    return NextResponse.json({ error: "Import failed while saving athletes" }, { status: 500 })
  }

  const { created, updated, errors } = summary
  console.log("[roster sheet import] summary:", { created, updated, errors: errors.length })

  return NextResponse.json({
    created,
    updated,
    parsed: parsed.rows.length,
    errors,
    tab: tabTitle})
}
