import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
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
    data,
  })
  return NextResponse.json({ success: true })
}
