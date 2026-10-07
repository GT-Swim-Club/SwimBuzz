import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import {
  listSheetTabs,
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

  if (!accessToken || !spreadsheetId) {
    return NextResponse.json({ error: "accessToken and spreadsheetId are required" }, { status: 400 })
  }

  try {
    const tabs = await listSheetTabs(accessToken, spreadsheetId)
    return NextResponse.json({
      tabs: tabs
        .sort((a, b) => a.index - b.index)
        .map((t) => ({ gid: t.sheetId, title: t.title })),
    })
  } catch (err) {
    if (err instanceof SheetAccessExpiredError) {
      return NextResponse.json({ error: "Google access expired — choose the sheet again." }, { status: 400 })
    }
    if (err instanceof SheetForbiddenError) {
      return NextResponse.json({ error: "Your Google account can't open that sheet." }, { status: 400 })
    }
    if (err instanceof SheetNotFoundError) {
      return NextResponse.json({ error: "Couldn't find that Google Sheet." }, { status: 400 })
    }
    console.error("Google Sheets tabs lookup failed:", err)
    return NextResponse.json({ error: "Failed to read that Google Sheet." }, { status: 502 })
  }
}
