import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { isColumnMappingValid } from "@/lib/roster/form-import-columns"
import { loadFormImportRoster, matchImportRow, type FormImportRosterContext, type ImportRowMatch } from "@/lib/roster/form-import-match"
import { normalizeMeetSignupQuestions, resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import { parseSignupResponseRecords, runSignupResponseImport } from "@/lib/meet/meet-signup-import"
import { parseRoomResponseRecords, runRoomResponseImport } from "@/lib/meet/meet-room-import"
import {
  loadFormImportMeetContext,
  parseFormType,
  parseMapping,
  parseOverrides,
  readMappedSheet,
  SheetReadError,
} from "../_shared"

export const runtime = "nodejs"

function buildMatches(
  rows: Array<{ rowNumber: number; rawName: string; rawEmail: string }>,
  rosterCtx: FormImportRosterContext,
  overrides: Map<number, string | null>
): Map<number, ImportRowMatch> {
  return new Map(
    rows.map((row) => [
      row.rowNumber,
      matchImportRow({ name: row.rawName, email: row.rawEmail }, rosterCtx, overrides.get(row.rowNumber)),
    ])
  )
}

function flattenWarnings(rowOutcomes: Array<{ rowNumber: number; warnings: string[] }>): string[] {
  return rowOutcomes.flatMap((o) => o.warnings.map((w) => `Row ${o.rowNumber}: ${w}`))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const body = await req.json().catch(() => ({}))
  const formType = parseFormType(body.formType)
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : ""
  const spreadsheetId = typeof body.spreadsheetId === "string" ? body.spreadsheetId : ""
  const gid = typeof body.gid === "number" ? body.gid : undefined
  const mapping = parseMapping(body.mapping)
  const overrides = parseOverrides(body.overrides)

  if (!formType) {
    return NextResponse.json({ error: "formType must be 'signup' or 'rooms'" }, { status: 400 })
  }
  if (!accessToken || !spreadsheetId) {
    return NextResponse.json({ error: "A picked Google Sheet is required" }, { status: 400 })
  }
  if (!mapping) return NextResponse.json({ error: "A column mapping is required" }, { status: 400 })
  const mappingCheck = isColumnMappingValid(mapping)
  if (!mappingCheck.ok) return NextResponse.json({ error: mappingCheck.error }, { status: 400 })

  const meet = await loadFormImportMeetContext(meetId)
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  let values: string[][]
  try {
    values = await readMappedSheet(accessToken, spreadsheetId, gid)
  } catch (err) {
    if (err instanceof SheetReadError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const rosterCtx = await loadFormImportRoster(meet.season)

  if (formType === "signup") {
    if (!meet.signupForm) {
      return NextResponse.json({ error: "Sign-ups are not set up for this meet" }, { status: 400 })
    }
    const eventOptions = resolveSignupEventOptions(meet.eventOrder)
    if (eventOptions.length === 0) {
      return NextResponse.json(
        { error: "Import a meet packet so the order of events is available." },
        { status: 400 }
      )
    }
    const questions = normalizeMeetSignupQuestions(meet.signupForm.customQuestions)
    const { rows, errors } = parseSignupResponseRecords(values, mapping, {
      eventOptions,
      questions,
      askNotes: meet.signupForm.askNotes,
    })

    const matches = buildMatches(rows, rosterCtx, overrides)
    const { created, updated, skipped, rowOutcomes } = await runSignupResponseImport(meetId, rows, matches, {
      dryRun: false,
    })

    return NextResponse.json({ created, updated, skipped, warnings: flattenWarnings(rowOutcomes), errors })
  }

  if (!meet.roomForm) {
    return NextResponse.json({ error: "Roommate preferences are not set up for this meet" }, { status: 400 })
  }
  const questions = normalizeMeetSignupQuestions(meet.roomForm.customQuestions)
  const { rows, errors } = parseRoomResponseRecords(values, mapping, { questions })

  const matches = buildMatches(rows, rosterCtx, overrides)
  const { created, updated, skipped, rowOutcomes } = await runRoomResponseImport(meetId, rows, matches, rosterCtx, {
    dryRun: false,
  })

  return NextResponse.json({ created, updated, skipped, warnings: flattenWarnings(rowOutcomes), errors })
}
