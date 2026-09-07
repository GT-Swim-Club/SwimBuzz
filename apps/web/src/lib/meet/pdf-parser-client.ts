import { randomUUID } from "crypto"
import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { fetchMeetFileBytes } from "@/lib/meet/meet-file-fetch"
import { uploadMeetFile } from "@/lib/meet/meet-storage"
import { MEET_FILE_BUCKET } from "@/lib/meet/meet-files"

/**
 * Parses meet PDFs server-side (`api/parse-pdf.py` in production, a local
 * `pdf_parsers.cli` subprocess in dev). Replaces the old desktop-scraper
 * round trip for PDF imports — the scraper is only needed for the browser
 * jobs (SwimCloud/SwimPhone) now.
 */

type ParserKind = "results" | "sheet" | "packet" | "nqt"

type ParserOptions = {
  course?: string
  team?: string
  sheetType?: string
}

function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: apps/web/src/lib is 4 levels below the repo root; process.cwd()
  // for `pnpm dev:web` (server.js) is apps/web, which is 2 levels below.
  return path.resolve(process.cwd(), "..", "..")
}

function isSupabaseStorageUrl(url: string): boolean {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "")
  if (!base) return false
  try {
    const target = new URL(url)
    const baseUrl = new URL(base)
    return (
      target.hostname === baseUrl.hostname &&
      target.pathname.startsWith(`/storage/v1/object/public/${MEET_FILE_BUCKET}/`)
    )
  } catch {
    return false
  }
}

/** The parser function only fetches from an allowlisted Supabase host — mirror
 * any other URL (a pasted external link, Drive/Dropbox, local dev path) into
 * Supabase Storage first so it has something safe to fetch. */
async function ensureAllowlistedUrl(url: string): Promise<string> {
  if (isSupabaseStorageUrl(url)) return url
  const bytes = await fetchMeetFileBytes(url)
  const { url: uploaded } = await uploadMeetFile(
    bytes,
    `pdf-parse-${randomUUID()}.pdf`,
    "application/pdf"
  )
  return uploaded
}

function runLocalParserCli<T>(
  kind: ParserKind,
  bytes: Buffer,
  options: ParserOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    const args = ["-m", "pdf_parsers.cli", "--kind", kind]
    if (options.course) args.push("--course", options.course)
    if (options.team) args.push("--team", options.team)
    if (options.sheetType) args.push("--sheet-type", options.sheetType)

    const child = spawn("python3", args, { cwd: repoRoot() })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        try {
          const parsed = JSON.parse(stderr) as { error?: string }
          reject(new Error(parsed.error || stderr || `pdf_parsers.cli exited ${code}`))
        } catch {
          reject(new Error(stderr || `pdf_parsers.cli exited ${code}`))
        }
        return
      }
      try {
        resolve(JSON.parse(stdout) as T)
      } catch {
        reject(new Error("Could not parse pdf_parsers.cli output"))
      }
    })
    child.stdin.end(bytes)
  })
}

async function callParser<T>(
  kind: ParserKind,
  url: string,
  options: ParserOptions
): Promise<T> {
  const parserUrl = process.env.PDF_PARSER_URL
  if (parserUrl) {
    const safeUrl = await ensureAllowlistedUrl(url)
    const secret = process.env.PDF_PARSER_SECRET
    if (!secret) throw new Error("PDF_PARSER_SECRET is not configured")

    // api/parse-pdf.py reads snake_case keys (course, team, sheet_type) —
    // send those, not the camelCase ParserOptions shape, so a deployed sheet
    // parse actually receives sheetType instead of silently running with
    // sheet_type=None while local dev (which passes --sheet-type) works fine.
    const res = await fetch(parserUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Parser-Secret": secret },
      body: JSON.stringify({
        kind,
        url: safeUrl,
        course: options.course,
        team: options.team,
        sheet_type: options.sheetType,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message =
        typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : `PDF parser failed (${res.status})`
      throw new Error(message)
    }
    return data as T
  }

  const fetchStart = Date.now()
  const bytes = await fetchMeetFileBytes(url)
  console.log(`[pdf-parser-client] fetchMeetFileBytes(${kind}) ${bytes.length}b in ${Date.now() - fetchStart}ms`)
  const parseStart = Date.now()
  const result = await runLocalParserCli<T>(kind, bytes, options)
  console.log(`[pdf-parser-client] runLocalParserCli(${kind}) in ${Date.now() - parseStart}ms`)
  return result
}

export async function parseMeetPdf<T>(
  userId: string,
  url: string,
  options: { course: string; team: string; fileName?: string }
): Promise<T> {
  return callParser<T>("results", url, { course: options.course, team: options.team })
}

export async function parseMeetSheetPdf<T>(
  userId: string,
  url: string,
  options: { sheetType: "psych" | "heat" | "entries"; team: string }
): Promise<T> {
  return callParser<T>("sheet", url, { sheetType: options.sheetType, team: options.team })
}

export async function parseMeetPacketPdfResult<T>(userId: string, url: string): Promise<T> {
  return callParser<T>("packet", url, {})
}

export async function parseNqtPdf<T>(userId: string, url: string): Promise<T> {
  return callParser<T>("nqt", url, {})
}
