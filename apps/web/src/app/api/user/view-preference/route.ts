import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return new NextResponse("Unauthorized", { status: 401 })
  const { defaultView, defaultPracticesView } = await req.json()
  
  const data: any = {}
  if (defaultView) {
      data.defaultView = defaultView === "list" ? "list" : "gallery"
  }
  if (defaultPracticesView) {
      data.defaultPracticesView = ["week", "month", "list"].includes(defaultPracticesView) ? defaultPracticesView : "week"
  }
  
  await prisma.user.update({
    where: { id: session.user.id },
    data})
  return NextResponse.json({ success: true })
}
