/**
 * Reads a Google Sheet using a short-lived OAuth access token obtained
 * client-side via the Google Picker flow (see google-picker-client.ts) —
 * nothing is persisted server-side, the token is used once and discarded.
 */

export type SheetTab = { sheetId: number; title: string; index: number }

export class SheetNotFoundError extends Error {
  constructor() {
    super("SHEET_NOT_FOUND")
  }
}

export class SheetForbiddenError extends Error {
  constructor() {
    super("SHEET_FORBIDDEN")
  }
}

export class SheetAccessExpiredError extends Error {
  constructor() {
    super("SHEET_ACCESS_EXPIRED")
  }
}

type SheetsMetaResponse = {
  sheets?: Array<{ properties?: { sheetId?: number; title?: string; index?: number } }>
}

/** Right-pad rows to the width of the header row — the Sheets API truncates trailing empty cells. */
function padRows(values: string[][]): string[][] {
  const width = values[0]?.length ?? 0
  return values.map((row) => (row.length >= width ? row : [...row, ...Array(width - row.length).fill("")]))
}

async function sheetsFetch(accessToken: string, path: string): Promise<Response> {
  return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

async function throwForStatus(res: Response): Promise<never> {
  const body = await res.text().catch(() => "")
  console.error(`Google Sheets API error ${res.status}:`, body)
  if (res.status === 404) throw new SheetNotFoundError()
  if (res.status === 403) throw new SheetForbiddenError()
  if (res.status === 401) throw new SheetAccessExpiredError()
  throw new Error(`Google Sheets API error: ${res.status}`)
}

/** List a spreadsheet's tabs — used to show a tab picker when there's more than one. */
export async function listSheetTabs(accessToken: string, spreadsheetId: string): Promise<SheetTab[]> {
  const res = await sheetsFetch(
    accessToken,
    `${spreadsheetId}?fields=${encodeURIComponent("sheets.properties(sheetId,title,index)")}`
  )
  if (!res.ok) await throwForStatus(res)
  const meta = (await res.json()) as SheetsMetaResponse
  return (meta.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is { sheetId: number; title: string; index: number } =>
      p != null && p.sheetId != null && p.title != null && p.index != null
    )
}

/** Pick a tab by gid, falling back to the first tab (by index) when gid is unset or not found. */
export function resolveTab(tabs: SheetTab[], gid?: number): SheetTab {
  const tab =
    (gid != null ? tabs.find((t) => t.sheetId === gid) : undefined) ??
    tabs.find((t) => t.index === 0) ??
    tabs[0]
  if (!tab) throw new SheetNotFoundError()
  return tab
}

/** Read a tab's grid values. */
export async function readSheetValues(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string
): Promise<string[][]> {
  const res = await sheetsFetch(
    accessToken,
    `${spreadsheetId}/values/${encodeURIComponent(tabTitle)}?majorDimension=ROWS`
  )
  if (!res.ok) await throwForStatus(res)
  const data = (await res.json()) as { values?: string[][] }
  return padRows(data.values ?? [])
}
