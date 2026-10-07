import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import {
  listSheetTabs,
  readSheetValues,
  resolveTab,
  SheetAccessExpiredError,
  SheetForbiddenError,
  SheetNotFoundError,
} from "@/lib/roster/google-sheets"
import { normalizeMeetSignupQuestions, resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import { buildTargetCatalog, suggestColumnMapping, type MappingContext } from "@/lib/roster/form-import-columns"

export const runtime = "nodejs"

type FormType = "signup" | "rooms"

function parseFormType(value: unknown): FormType | null {
  return value === "signup" || value === "rooms" ? value : null
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

  if (!formType) {
    return NextResponse.json({ error: "formType must be 'signup' or 'rooms'" }, { status: 400 })
  }
  if (!accessToken || !spreadsheetId) {
    return NextResponse.json({ error: "A picked Google Sheet is required" }, { status: 400 })
  }

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      eventOrder: true,
      signupForm: { select: { customQuestions: true } },
      roomForm: { select: { customQuestions: true } },
    },
  })
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  const mappingCtx: MappingContext = { formType, questions: [] }

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
    mappingCtx.eventOptions = eventOptions.map((o) => o.event)
    mappingCtx.questions = normalizeMeetSignupQuestions(meet.signupForm.customQuestions)
  } else {
    if (!meet.roomForm) {
      return NextResponse.json({ error: "Roommate preferences are not set up for this meet" }, { status: 400 })
    }
    mappingCtx.questions = normalizeMeetSignupQuestions(meet.roomForm.customQuestions)
  }

  let tabs
  let tabTitle: string
  let values: string[][]
  try {
    tabs = await listSheetTabs(accessToken, spreadsheetId)
    const tab = resolveTab(tabs, gid)
    tabTitle = tab.title
    values = await readSheetValues(accessToken, spreadsheetId, tabTitle)
  } catch (err) {
    if (err instanceof SheetAccessExpiredError) {
      return NextResponse.json({ error: "Google access expired — choose the sheet again." }, { status: 400 })
    }
    if (err instanceof SheetForbiddenError) {
      return NextResponse.json({ error: "Your Google account can't open that sheet." }, { status: 400 })
    }
    if (err instanceof SheetNotFoundError) {
      return NextResponse.json({ error: "Couldn't find that Google Sheet or tab." }, { status: 400 })
    }
    console.error("Form response import preview failed:", err)
    return NextResponse.json({ error: "Failed to read that Google Sheet." }, { status: 502 })
  }

  const headers = values[0] ?? []
  const sampleRows = values.slice(1, 4)

  return NextResponse.json({
    tabs: tabs.map((t) => ({ gid: t.sheetId, title: t.title })),
    tab: tabTitle,
    headers,
    sampleRows,
    rowCount: Math.max(values.length - 1, 0),
    targets: buildTargetCatalog(mappingCtx),
    suggestedMapping: suggestColumnMapping(headers, mappingCtx),
  })
}
