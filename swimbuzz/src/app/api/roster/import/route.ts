import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { Gender } from "@prisma/client"
import { parseSeason } from "@/lib/season"
import { parseRosterCsv } from "@/lib/roster-csv"
import {
  createImportAthlete,
  findAthleteForImport,
  loadRosterImportContext,
  mergeImportAthlete,
  registerImportAthlete,
  swimCloudIdConflict,
} from "@/lib/roster-import"

export const runtime = "nodejs"

function isUpload(value: unknown): value is Blob {
  return value != null && typeof value !== "string" && typeof (value as Blob).arrayBuffer === "function"
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
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
    parseErrors: parsed.errors.length,
  })
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

  let created = 0
  let updated = 0
  const importErrors: Array<{ row: number; message: string }> = [...parsed.errors]
  const rowOutcomes: Array<{ row: number; action: "created" | "updated" | "skipped"; name: string; detail?: string }> =
    []

  try {
    const context = await loadRosterImportContext()

    for (const row of parsed.rows) {
      const input = {
        firstName: row.firstName,
        lastName: row.lastName,
        gender: row.gender === "F" ? Gender.F : Gender.M,
        ...(row.email ? { email: row.email } : {}),
        ...(row.gtid ? { gtid: row.gtid } : {}),
        ...(row.dob ? { dob: row.dob } : {}),
        ...(row.year ? { year: row.year } : {}),
        ...(row.nicknames.length > 0 ? { nicknames: row.nicknames } : {}),
      }

      const existing = findAthleteForImport(input, context)
      // Conflict check removed as swimCloudId is no longer in CSV input

      if (existing) {
        const hadSeason = existing.seasons.includes(season)
        const merged = await mergeImportAthlete(existing, input, season)
        registerImportAthlete(context, merged)
        updated++
        rowOutcomes.push({
          row: row.rowNumber,
          action: "updated",
          name: `${row.lastName}, ${row.firstName}`,
          detail: hadSeason ? "merged with existing athlete" : `added to ${season}`,
        })
        continue
      }

      const athlete = await createImportAthlete(input, season, row.rowNumber)
      registerImportAthlete(context, athlete)
      created++
      rowOutcomes.push({
        row: row.rowNumber,
        action: "created",
        name: `${row.lastName}, ${row.firstName}`,
        detail: row.email ?? athlete.userEmail,
      })
    }
  } catch (err) {
    console.error("CSV roster import failed:", err)
    return NextResponse.json({ error: "Import failed while saving athletes" }, { status: 500 })
  }

  console.log("[roster csv import] summary:", {
    created,
    updated,
    skipped: rowOutcomes.filter((r) => r.action === "skipped").length,
    parseErrors: parsed.errors.length,
    importErrors: importErrors.length - parsed.errors.length,
  })
  console.log("[roster csv import] rows:", rowOutcomes)
  if (importErrors.length > parsed.errors.length) {
    console.log(
      "[roster csv import] import errors:",
      importErrors.filter((e) => !parsed.errors.some((p) => p.row === e.row && p.message === e.message))
    )
  }

  return NextResponse.json({
    created,
    updated,
    parsed: parsed.rows.length,
    errors: importErrors,
  })
}
