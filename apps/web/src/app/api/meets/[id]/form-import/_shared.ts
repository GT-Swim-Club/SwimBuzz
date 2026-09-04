import { prisma } from "@/lib/prisma"
import {
  listSheetTabs,
  readSheetValues,
  resolveTab,
  SheetAccessExpiredError,
  SheetForbiddenError,
  SheetNotFoundError,
} from "@/lib/roster/google-sheets"
import type { ColumnMapping } from "@/lib/roster/form-import-columns"

export type FormType = "signup" | "rooms"

export function parseFormType(value: unknown): FormType | null {
  return value === "signup" || value === "rooms" ? value : null
}

export function parseMapping(value: unknown): ColumnMapping | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value as ColumnMapping
}

/** `{ [rowNumber]: athleteId | null }` — null means "skip this row". */
export function parseOverrides(value: unknown): Map<number, string | null> {
  const map = new Map<number, string | null>()
  if (!value || typeof value !== "object") return map
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const rowNumber = Number(key)
    if (!Number.isFinite(rowNumber)) continue
    if (val === null) map.set(rowNumber, null)
    else if (typeof val === "string" && val.trim()) map.set(rowNumber, val.trim())
  }
  return map
}

export class SheetReadError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Read a picked sheet's values, mapping the google-sheets.ts errors to a user-facing message + status. */
export async function readMappedSheet(
  accessToken: string,
  spreadsheetId: string,
  gid: number | undefined
): Promise<string[][]> {
  try {
    const tabs = await listSheetTabs(accessToken, spreadsheetId)
    const tab = resolveTab(tabs, gid)
    return await readSheetValues(accessToken, spreadsheetId, tab.title)
  } catch (err) {
    if (err instanceof SheetAccessExpiredError) {
      throw new SheetReadError("Google access expired — choose the sheet again.", 400)
    }
    if (err instanceof SheetForbiddenError) {
      throw new SheetReadError("Your Google account can't open that sheet.", 400)
    }
    if (err instanceof SheetNotFoundError) {
      throw new SheetReadError("Couldn't find that Google Sheet or tab.", 400)
    }
    console.error("Form response import sheet read failed:", err)
    throw new SheetReadError("Failed to read that Google Sheet.", 502)
  }
}

export function loadFormImportMeetContext(meetId: string) {
  return prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      season: true,
      eventOrder: true,
      signupForm: { select: { customQuestions: true, askNotes: true } },
      roomForm: { select: { customQuestions: true } },
    },
  })
}
