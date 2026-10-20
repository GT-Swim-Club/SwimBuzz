import { parseCsvRecords } from "@/lib/roster/roster-csv"
import {
  listSheetTabs,
  readSheetValues,
  resolveTab,
  SheetAccessExpiredError,
  SheetForbiddenError,
  SheetNotFoundError,
} from "@/lib/roster/google-sheets"

/**
 * Request body shared by the meet sheet imports (sign-ups, final roster): a CSV
 * upload (multipart) or a Google Sheet picked client-side (JSON), plus the
 * coach's name pairings when re-run after the pairing dialog.
 */

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

export type SheetImportSource =
  | {
      values: string[][]
      nameMappings?: unknown
      rejectedNames?: unknown
      /** True on the re-run after the pairing dialog (paired or skipped). */
      paired: boolean
    }
  | { error: string; status: number }

/** Read the grid from a CSV upload (multipart) or a picked Google Sheet (JSON). */
export async function readSheetImportSource(req: Request): Promise<SheetImportSource> {
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    if (!isUpload(file)) return { error: "CSV file is required", status: 400 }
    const name = file instanceof File && file.name ? file.name : "import.csv"
    if (!name.toLowerCase().endsWith(".csv")) return { error: "File must be a .csv", status: 400 }
    return {
      values: parseCsvRecords(new TextDecoder().decode(await file.arrayBuffer())),
      nameMappings: parseJsonField(form.get("nameMappings")),
      rejectedNames: parseJsonField(form.get("rejectedNames")),
      paired: form.get("paired") === "true",
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
      paired: body.paired === true,
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
    console.error("Google Sheets meet import fetch failed:", err)
    return { error: "Failed to read that Google Sheet.", status: 502 }
  }
}
