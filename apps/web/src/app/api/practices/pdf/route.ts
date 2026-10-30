import { NextResponse } from "next/server"
import { attachmentDisposition } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { buildPracticesPdf, practicesPdfFilename } from "@/lib/practice/practice-pdf"
import {
  practicePdfDayKey,
  practicePdfInclude,
  practicePdfStart,
  toPracticePdfInput,
} from "@/lib/practice/practice-pdf-load"
import { practiceListWhere, practiceViewer } from "@/lib/practice/practice-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_PRACTICES = 100

/** Combined PDF of several practices, each starting on a new page, ordered oldest first. */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one practice" }, { status: 400 })
  }
  if (ids.length > MAX_PRACTICES) {
    return NextResponse.json(
      { error: `Export at most ${MAX_PRACTICES} practices at a time` },
      { status: 400 }
    )
  }

  const viewer = practiceViewer(session)
  const staff = viewer.isStaff
  const practices = await prisma.practice.findMany({
    where: { AND: [{ id: { in: ids } }, practiceListWhere(viewer)] },
    include: practicePdfInclude,
  })
  if (practices.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  practices.sort((a, b) => practicePdfStart(a).getTime() - practicePdfStart(b).getTime())

  const doc = buildPracticesPdf(practices.map((practice) => toPracticePdfInput(practice, staff)))
  const bytes = new Uint8Array(doc.output("arraybuffer"))
  const filename = practicesPdfFilename(practices.map(practicePdfDayKey))

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(filename),
      "Cache-Control": "no-store",
    },
  })
}
