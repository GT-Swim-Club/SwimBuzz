import { NextResponse } from "next/server"
import { importMeetResults, resolveMeetDate, resultSwimmerNames } from "@/lib/meet/meet-import"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete/athlete-match"
import {
  assertDocTypeMatches,
  assertMeetNameMatches,
  MeetImportValidationError,
} from "@/lib/meet/meet-import-validate"
import { parseMeetPdf } from "@/lib/meet/pdf-parser-client"
import { coercePlaceTimesEvents } from "@/lib/meet/place-times"
import { prisma } from "@/lib/prisma"
import { PARSE_TMP_FOLDER, meetFileFolder } from "@/lib/meet/meet-files"
import { deleteUnreferencedStoredFiles, uploadMeetFile } from "@/lib/meet/meet-storage"
import { notifyMeetRosterOfInfoDrops } from "@/lib/meet/meet-roster-notify"
import { notifyNewNationalCuts } from "@/lib/notifications/national-cut-notify"
import { parseSeason } from "@/lib/season"
import { coerceParsedRelayResults } from "@/lib/meet/relay-results"
import { canonicalResultTeams, coerceResultTeams } from "@/lib/meet/result-teams"
import { isEventOrder } from "@/lib/meet/meet-event-order"
import { rescoreResultsByGender } from "@/lib/meet/gender-scoring"
import { isClientDisconnected, throwIfDisconnected } from "@/lib/client-disconnect"
import { getSession } from "@/lib/auth/session"
import {
  creepProgress,
  scaleProgress,
  streamImport,
  wantsImportStream,
  type ImportStreamProgress,
} from "@/lib/import-stream"
import { coerceTeamScores, isStaffRole } from "@swimbuzz/shared"
import { Prisma } from "@prisma/client"
import { addPairedAthletesToSeason, joinEmptySeasonFromOtherSeasons } from "@/lib/athlete/paired-athlete-seasons"

function isUpload(value: unknown): value is Blob {
  return value != null && typeof value !== "string" && typeof (value as Blob).arrayBuffer === "function"
}

type ParsedResult = {
  name: string
  event: string
  time: string
  course: string
  tags?: string
  place?: number
  points?: number
  /** The team the results print the swim under ("GTSC Gold"). */
  team?: string | null
}

const MAX_BYTES = 20 * 1024 * 1024

function parseJsonField(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const runtime = "nodejs"
export const maxDuration = 300

async function applyParsedMeetPdf(input: {
  parsed: {
    course?: string
    meet_name?: string | null
    meet_date?: string | null
    detectedSheetType?: string | null
    results: ParsedResult[]
    relay_results?: unknown[]
    team_scores?: unknown
    /** The results' own order of events ("Event 1 …" headers). */
    event_order?: unknown
    /** Every event's champion, 8th and 24th place times, across all teams. */
    place_times?: unknown
  }
  season: string
  courseDefault: string
  meet: {
    id: string
    name: string
    startsAt: Date | null
    resultsUrl: string | null
    packetUrl: string | null
    /** Place and score women and men separately in mixed individual events. */
    scoreByGender: boolean
    scoringTable: Prisma.JsonValue
  } | null
  nameMappings: ReturnType<typeof normalizeNameMappings>
  rejectedNames: ReturnType<typeof normalizeRejectedNames>
  pairOnly: boolean
  resultsPdfUrl: string | null
  fileName: string
  /** The import's team codes ("White, Gold"), naming each swimmer's team. */
  teamCodes: string | null
  /** Live progress, 0–1 across saving the parsed results. */
  onProgress?: (progress: ImportStreamProgress) => void
}) {
  const { parsed, season, courseDefault, meet, nameMappings, rejectedNames, pairOnly, resultsPdfUrl, fileName } =
    input

  assertDocTypeMatches("results", parsed.detectedSheetType)
  if (meet?.name) {
    assertMeetNameMatches(meet.name, parsed.meet_name, "PDF")
  }

  const meetName =
    meet?.name ?? ((parsed.meet_name ?? "").trim() || fileName.replace(/\.pdf$/i, ""))
  const meetDate = meet?.startsAt ?? resolveMeetDate(parsed.meet_date) ?? new Date()

  // Athletes paired from another season join this one before anything reads its roster.
  await addPairedAthletesToSeason(nameMappings, season)
  // A season with no roster yet (a past one): swimmers are matched by name from every season.
  const { rosterless } = await joinEmptySeasonFromOtherSeasons({
    season,
    names: resultSwimmerNames(parsed.results ?? [], coerceParsedRelayResults(parsed.relay_results)),
    rejectedNames,
  })

  const { onProgress } = input
  // Women and men scored separately: the results' combined places and points are recomputed.
  if (meet?.scoreByGender) onProgress?.({ progress: 0, detail: "Scoring women and men…" })
  const byGender = meet?.scoreByGender
    ? await rescoreResultsByGender({
        results: parsed.results ?? [],
        relays: coerceParsedRelayResults(parsed.relay_results),
        season,
        nameMappings,
        scoringTable: meet.scoringTable,
        printedTeamScores: coerceTeamScores(parsed.team_scores),
      })
    : null
  const results = byGender?.results ?? parsed.results ?? []

  const { athleteTeams: printedTeams, ...summary } = await importMeetResults({
    season,
    meetName,
    meetDate,
    results,
    relayResults: coerceParsedRelayResults(parsed.relay_results),
    source: "meet_pdf",
    courseDefault: parsed.course || courseDefault,
    meetId: meet?.id ?? null,
    nameMappings,
    rejectedNames,
    pairOnly,
    allResults: results,
    allRelayResults: coerceParsedRelayResults(parsed.relay_results),
    rescored: byGender != null,
    pairAcrossSeasons: rosterless,
    onProgress: scaleProgress(onProgress, 0.03, 0.97),
  })

  const athleteTeams = canonicalResultTeams(printedTeams, input.teamCodes)
  // Each swimmer's team, when the results name several of ours (an intrasquad's Gold and White):
  // splits the meet's highlights per team. A full import replaces it; pairing a few names adds them.
  if (meet?.id && pairOnly && Object.keys(athleteTeams).length > 0) {
    try {
      const current = await prisma.meet.findUnique({ where: { id: meet.id }, select: { resultTeams: true } })
      const merged = { ...coerceResultTeams(current?.resultTeams), ...athleteTeams }
      if (new Set(Object.values(merged)).size > 1) {
        await prisma.meet.update({ where: { id: meet.id }, data: { resultTeams: merged } })
      }
    } catch (err) {
      console.error("Failed to save paired swimmers' teams:", err)
    }
  }

  if (meet?.id && !pairOnly && resultsPdfUrl) {
    try {
      const teamScores = byGender ? byGender.teamScores : coerceTeamScores(parsed.team_scores)
      const placeTimes = coercePlaceTimesEvents(parsed.place_times)
      await prisma.meet.update({
        where: { id: meet.id },
        data: {
          resultsUrl: resultsPdfUrl,
          resultTeams:
            new Set(Object.values(athleteTeams)).size > 1
              ? (athleteTeams as Prisma.InputJsonValue)
              : Prisma.DbNull,
          teamScores: teamScores
            ? ({ ...teamScores, importedAt: new Date().toISOString() } as Prisma.InputJsonValue)
            : Prisma.DbNull,
          // The field's champion, 8th and 24th place times (a Nationals meet's show on next
          // season's qualifiers PDF).
          placeTimes:
            placeTimes.length > 0
              ? ({ importedAt: new Date().toISOString(), events: placeTimes } as Prisma.InputJsonValue)
              : Prisma.DbNull,
          // Without a meet packet, the results' event numbers are the meet's order of events.
          ...(!meet.packetUrl && isEventOrder(parsed.event_order)
            ? { eventOrder: parsed.event_order as unknown as Prisma.InputJsonValue }
            : {}),
        },
      })
      // The replaced results PDF — after the update, and never the PDF just saved
      // (re-importing from the stored results URL used to delete it).
      if (meet.resultsUrl && meet.resultsUrl.trim() !== resultsPdfUrl.trim()) {
        await deleteUnreferencedStoredFiles([meet.resultsUrl])
      }
      if (summary.imported > 0) {
        notifyMeetRosterOfInfoDrops({
          meetId: meet.id,
          meetName: meet.name,
          drops: ["results"],
        })
        notifyNewNationalCuts(meet.id)
      }
    } catch (err) {
      console.error("Failed to save results PDF as meet resource:", err)
    }
  }

  return {
    ...summary,
    meetName,
    meetDate: meetDate.toISOString(),
    cachedParse:
      summary.nameConfirmations.length > 0
        ? {
            course: parsed.course,
            meet_name: parsed.meet_name,
            meet_date: parsed.meet_date,
            detectedSheetType: parsed.detectedSheetType,
            results: parsed.results ?? [],
            relay_results: parsed.relay_results ?? [],
          }
        : undefined,
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  const pdfUrl = String(formData.get("pdfUrl") ?? "").trim() || null
  const courseDefault = String(formData.get("course") ?? "SCY").trim().toUpperCase()
  const team = String(formData.get("team") ?? "").trim() || null
  const seasonRaw = formData.get("season") ?? formData.get("year")
  const meetId = String(formData.get("meetId") ?? "").trim() || null
  const nameMappings = normalizeNameMappings(parseJsonField(formData.get("nameMappings")))
  const rejectedNames = normalizeRejectedNames(parseJsonField(formData.get("rejectedNames")))
  const cachedParse = parseJsonField(formData.get("cachedParse")) as {
    course?: string
    meet_name?: string | null
    meet_date?: string | null
    detectedSheetType?: string | null
    results?: ParsedResult[]
    relay_results?: unknown[]
  } | null

  const pairOnly = Boolean(nameMappings)

  if (!pairOnly && !isUpload(file) && !pdfUrl) {
    return NextResponse.json({ error: "PDF file or URL is required" }, { status: 400 })
  }

  let fileName = "meet-results.pdf"
  let fileType = "application/pdf"
  let fileBytes: ArrayBuffer | undefined

  if (!pairOnly) {
    if (pdfUrl) {
      try {
        const response = await fetch(pdfUrl)
        if (!response.ok) {
          return NextResponse.json({ error: "Failed to fetch PDF from URL" }, { status: 400 })
        }
        fileBytes = await response.arrayBuffer()
        const urlPath = new URL(pdfUrl).pathname
        const urlFileName = urlPath.split("/").pop()
        if (urlFileName && urlFileName.toLowerCase().endsWith(".pdf")) {
          fileName = urlFileName
        }
      } catch {
        return NextResponse.json({ error: "Invalid PDF URL" }, { status: 400 })
      }
    } else if (isUpload(file)) {
      fileName = file instanceof File && file.name ? file.name : "meet-results.pdf"
      fileType = (file instanceof File && file.type) || "application/pdf"
      if (!fileName.toLowerCase().endsWith(".pdf") && fileType !== "application/pdf") {
        return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })
      }
      fileBytes = await file.arrayBuffer()
    } else {
      return NextResponse.json({ error: "PDF file or URL is required" }, { status: 400 })
    }
  }

  if (fileBytes && fileBytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 20 MB or smaller" }, { status: 400 })
  }

  if (pairOnly && !cachedParse?.results) {
    return NextResponse.json(
      { error: "Cached parse data is required when pairing athletes" },
      { status: 400 }
    )
  }
  const meet = meetId
    ? await prisma.meet.findUnique({ where: { id: meetId } })
    : null

  const season = parseSeason(meet?.season ?? seasonRaw)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025–2026)" }, { status: 400 })
  }

  if (!team) {
    return NextResponse.json({ error: "Team code is required" }, { status: 400 })
  }

  type ParsedPdf = {
    course?: string
    meet_name?: string | null
    meet_date?: string | null
    detectedSheetType?: string | null
    results: ParsedResult[]
    relay_results?: unknown[]
    team_scores?: unknown
    event_order?: unknown
    place_times?: unknown
  }

  const applyParsed = (
    parsed: ParsedPdf,
    resultsPdfUrl: string | null,
    onProgress?: (progress: ImportStreamProgress) => void
  ) =>
    applyParsedMeetPdf({
      parsed,
      season,
      courseDefault,
      meet,
      nameMappings,
      rejectedNames,
      pairOnly,
      resultsPdfUrl,
      fileName,
      teamCodes: team,
      onProgress,
    })

  const execute = async (
    onProgress?: (progress: ImportStreamProgress) => void
  ): Promise<Record<string, unknown>> => {
    // Pairing re-applies the earlier parse: no upload, no parser.
    if (cachedParse?.results) {
      throwIfDisconnected(req.signal)
      return applyParsed(
        {
          course: cachedParse.course,
          meet_name: cachedParse.meet_name,
          meet_date: cachedParse.meet_date,
          detectedSheetType: cachedParse.detectedSheetType,
          results: cachedParse.results,
          relay_results: cachedParse.relay_results,
        },
        pdfUrl,
        onProgress
      )
    }

    let resultsPdfUrl = pdfUrl
    /** A copy uploaded here; deleted at the end unless the meet saved it as its results PDF. */
    let uploadedUrl: string | null = null
    try {
      if (!resultsPdfUrl && fileBytes) {
        onProgress?.({ progress: 0, detail: "Saving PDF…" })
        try {
          const { url } = await uploadMeetFile(
            Buffer.from(fileBytes),
            fileName,
            fileType,
            meet ? meetFileFolder(meet.id) : PARSE_TMP_FOLDER
          )
          resultsPdfUrl = url
          uploadedUrl = url
        } catch (err) {
          console.error("Failed to upload meet PDF before parsing:", err)
        }
      }

      if (!resultsPdfUrl) throw new Error("Could not prepare PDF for parsing")

      throwIfDisconnected(req.signal)
      // The parser can't report its own progress, so the bar eases forward while it reads.
      const stopCreep = creepProgress(onProgress, {
        from: 0.05,
        to: 0.5,
        detail: "Reading PDF…",
        expectedMs: 8000,
      })
      let parsed: ParsedPdf
      try {
        parsed = await parseMeetPdf<ParsedPdf>(session.user.id, resultsPdfUrl, {
          course: courseDefault,
          team,
          fileName,
        })
      } finally {
        stopCreep()
      }

      throwIfDisconnected(req.signal)
      return await applyParsed(parsed, resultsPdfUrl, scaleProgress(onProgress, 0.5, 1))
    } finally {
      // Reference-checked, so it stays when the meet now points at it.
      if (uploadedUrl) await deleteUnreferencedStoredFiles([uploadedUrl])
    }
  }

  if (wantsImportStream(req)) {
    return streamImport(execute, {
      label: "meet results import",
      failureMessage: (err) =>
        err instanceof Error && err.message ? err.message : "Failed to import results",
    })
  }

  try {
    return NextResponse.json(await execute())
  } catch (err) {
    if (isClientDisconnected(err)) return new NextResponse(null, { status: 499 })
    if (err instanceof MeetImportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (cachedParse?.results) throw err
    const message = err instanceof Error ? err.message : "Failed to parse PDF"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
