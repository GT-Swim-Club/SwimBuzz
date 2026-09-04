import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { signupWindowStatus } from "@/lib/meet/meet-signup"

/**
 * Cheap poll target for MeetSignupSection — a signal that changes only when
 * something the page needs to re-render actually changed (window open/close,
 * or an entry was added/edited/withdrawn), so the client can skip
 * `router.refresh()` on the common case where nothing happened.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: meetId } = await params
  const form = await prisma.meetSignupForm.findUnique({
    where: { meetId },
    select: { id: true, openAt: true, closeAt: true }})

  if (!form) {
    return NextResponse.json(
      { hasForm: false, openAt: null, closeAt: null, entryCount: 0, latestEntryUpdatedAt: null },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  }

  const [entryCount, latest] = await Promise.all([
    prisma.meetSignupEntry.count({ where: { formId: form.id } }),
    prisma.meetSignupEntry.findFirst({
      where: { formId: form.id },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true }}),
  ])

  return NextResponse.json(
    {
      hasForm: true,
      // Computed at request time so it flips exactly when the window
      // transitions, even though openAt/closeAt themselves never change.
      open: signupWindowStatus({ openAt: form.openAt, closeAt: form.closeAt }).open,
      openAt: form.openAt?.toISOString() ?? null,
      closeAt: form.closeAt?.toISOString() ?? null,
      entryCount,
      latestEntryUpdatedAt: latest?.updatedAt.toISOString() ?? null},
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
