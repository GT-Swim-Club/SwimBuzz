import { NextResponse } from "next/server"
import { parseSeason } from "@/lib/season"
import { parseRosterCsv } from "@/lib/roster-csv"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"
import { runRosterImport } from "@/lib/roster-import"

export const runtime = "nodejs"

function isUpload(value: unknown): value is Blob {
  return value != null && typeof value !== "string" && typeof (value as Blob).arrayBuffer === "function"
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  const season = parseSeason(formData.get("season") ?? formData.get("year"))
  if (!isUpload(file)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 })
  }
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  const fileName = file instanceof File && file.name ? file.name : "roster.csv"
  if (!fileName.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "File must be a .csv" }, { status: 400 })
  }

  const text = new TextDecoder().decode(await file.arrayBuffer())
  const parsed = parseRosterCsv(text)

  console.log("[roster csv import]", {
    file: fileName,
    season,
    parsedRows: parsed.rows.length,
    parseErrors: parsed.errors.length})
  if (parsed.rows[0]) {
    console.log("[roster csv import] sample row:", parsed.rows[0])
  }
  if (parsed.errors.length > 0) {
    console.log("[roster csv import] parse errors:", parsed.errors)
  }

  if (parsed.rows.length === 0 && parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0]?.message ?? "Could not parse CSV", errors: parsed.errors },
      { status: 400 }
    )
  }

  let summary
  try {
    summary = await runRosterImport(parsed.rows, season, parsed.errors)
  } catch (err) {
    console.error("CSV roster import failed:", err)
    return NextResponse.json({ error: "Import failed while saving athletes" }, { status: 500 })
  }

  const { created, updated, errors, rowOutcomes } = summary
  console.log("[roster csv import] summary:", {
    created,
    updated,
    skipped: rowOutcomes.filter((r) => r.action === "skipped").length,
    parseErrors: parsed.errors.length,
    importErrors: errors.length - parsed.errors.length})
  console.log("[roster csv import] rows:", rowOutcomes)
  if (errors.length > parsed.errors.length) {
    console.log(
      "[roster csv import] import errors:",
      errors.filter((e) => !parsed.errors.some((p) => p.row === e.row && p.message === e.message))
    )
  }

  return NextResponse.json({
    created,
    updated,
    parsed: parsed.rows.length,
    errors})
}
