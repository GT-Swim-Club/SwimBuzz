import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { buildPracticePdf, practicePdfFilename } from "@/lib/practice/practice-pdf"
import { practicePdfDayKey, practicePdfInclude, toPracticePdfInput } from "@/lib/practice/practice-pdf-load"
import { canViewPractice, practiceViewer } from "@/lib/practice/practice-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: practicePdfInclude,
  })
  const viewer = practiceViewer(session)
  const staff = viewer.isStaff
  if (!practice || !canViewPractice(practice, viewer)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const doc = buildPracticePdf(toPracticePdfInput(practice, staff))
  const bytes = new Uint8Array(doc.output("arraybuffer"))
  const filename = practicePdfFilename(practice.title, practicePdfDayKey(practice))

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
