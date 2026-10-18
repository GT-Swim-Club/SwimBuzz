import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { Gender, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { parseCsvRecords } from "@/lib/roster/roster-csv"
import {
  listSheetTabs,
  readSheetValues,
  resolveTab,
  SheetAccessExpiredError,
  SheetForbiddenError,
  SheetNotFoundError,
} from "@/lib/roster/google-sheets"
import {
  buildAthleteLookup,
  normalizeNameMappings,
  normalizeRejectedNames,
} from "@/lib/athlete/athlete-match"
import { collectNameConfirmations } from "@/lib/meet/meet-import"
import { resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import {
  applySignupImportToEntriesSummary,
  buildSignupRelayPreferences,
  parseSignupRecords,
  resolveSignupImport,
  type SignupRosterAthlete,
} from "@/lib/meet/meet-signup-import"
import {
  isResultStatusesSummary,
  isSheetSummary,
  meetHasImportedResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"

export const runtime = "nodejs"

function isUpload(value: unknown): value is Blob {
  return value != null && typeof value !== "string" && typeof (value as Blob).arrayBuffer === "function"
}

function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

type SourceInput = { values: string[][] } | { error: string; status: number }

/** Read the response grid from a CSV upload (multipart) or a picked Google Sheet (JSON). */
async function readSource(req: Request): Promise<
  SourceInput & { nameMappings?: unknown; rejectedNames?: unknown }
> {
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    if (!isUpload(file)) return { error: "CSV file is required", status: 400 }
    const name = file instanceof File && file.name ? file.name : "signups.csv"
    if (!name.toLowerCase().endsWith(".csv")) return { error: "File must be a .csv", status: 400 }
    return {
      values: parseCsvRecords(new TextDecoder().decode(await file.arrayBuffer())),
      nameMappings: parseJsonField(form.get("nameMappings")),
      rejectedNames: parseJsonField(form.get("rejectedNames")),
    }
  }

  const body = await req.json().catch(() => ({}))
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : ""
  const spreadsheetId = typeof body.spreadsheetId === "string" ? body.spreadsheetId : ""
  const gid = typeof body.gid === "number" ? body.gid : undefined
  if (!accessToken || !spreadsheetId) {
    return { error: "A picked Google Sheet is required", status: 400 }
  }
  try {
    const tab = resolveTab(await listSheetTabs(accessToken, spreadsheetId), gid)
    return {
      values: await readSheetValues(accessToken, spreadsheetId, tab.title),
      nameMappings: body.nameMappings,
      rejectedNames: body.rejectedNames,
    }
  } catch (err) {
    if (err instanceof SheetAccessExpiredError) {
      return { error: "Google access expired — choose the sheet again.", status: 400 }
    }
    if (err instanceof SheetForbiddenError) {
      return { error: "Your Google account can't open that sheet.", status: 400 }
    }
    if (err instanceof SheetNotFoundError) {
      return { error: "Couldn't find that Google Sheet or tab.", status: 400 }
    }
    console.error("Google Sheets sign-up import fetch failed:", err)
    return { error: "Failed to read that Google Sheet.", status: 502 }
  }
}

/**
 * Import meet sign-ups (form responses) into the roster summary. Replaces the
 * previous sign-up import; re-run with `nameMappings`/`rejectedNames` after the
 * coach pairs unmatched names.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      course: true,
      season: true,
      eventOrder: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      _count: { select: { swims: true } },
    },
  })
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  if (
    meetHasImportedResults({
      swimCount: meet._count.swims,
      resultStatusEntries: isResultStatusesSummary(meet.resultStatusesSummary)
        ? meet.resultStatusesSummary.entries
        : null,
      relayResults: isRelayResultsSummary(meet.relayResultsSummary)
        ? meet.relayResultsSummary.entries
        : null,
    })
  ) {
    return NextResponse.json(
      { error: "Sign-ups can't be imported after results have been imported." },
      { status: 409 }
    )
  }

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  if (eventOptions.length === 0) {
    return NextResponse.json(
      { error: "Add the meet packet first so event numbers can be matched." },
      { status: 400 }
    )
  }

  const source = await readSource(req)
  if ("error" in source) {
    return NextResponse.json({ error: source.error }, { status: source.status })
  }

  const parsed = parseSignupRecords(source.values)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      gender: true,
      user: { select: { email: true } },
    },
  })
  const roster: SignupRosterAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    preferredName: a.preferredName,
    gender: a.gender === Gender.F ? "F" : "M",
    email: a.user.email,
  }))

  const nameMappings = normalizeNameMappings(source.nameMappings)
  const rejectedNames = normalizeRejectedNames(source.rejectedNames)
  const resolved = resolveSignupImport(parsed.rows, roster, eventOptions, nameMappings, rejectedNames)

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const { summary, entries, attendingOnly } = applySignupImportToEntriesSummary(
    existing,
    meet.course,
    resolved.signups
  )

  await prisma.meet.update({
    where: { id: meetId },
    data: {
      entriesSheetSummary: summary as Prisma.InputJsonValue,
      signupRelayPreferences: buildSignupRelayPreferences(resolved.signups) as Prisma.InputJsonValue,
    },
  })
  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/relays", "page")

  const nameConfirmations = collectNameConfirmations(
    resolved.unmatchedNames,
    roster,
    buildAthleteLookup(roster),
    nameMappings,
    rejectedNames
  )
  const rosterForPairing =
    nameConfirmations.length > 0
      ? roster
          .map((a) => ({ id: a.id, firstName: a.firstName, lastName: a.lastName }))
          .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
      : []

  return NextResponse.json({
    imported: resolved.signups.length,
    entries,
    attendingOnly,
    skipped: resolved.unmatchedNames.length + resolved.rejected,
    warnings: resolved.warnings,
    nameConfirmations,
    rosterForPairing,
  })
}
