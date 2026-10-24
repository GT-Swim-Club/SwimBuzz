import { NextResponse } from "next/server"
import { checkCommentCreationRateLimit } from "@/lib/practice/comment-rate-limit"
import { notifyPracticeComment } from "@/lib/notifications/notifications"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { canViewPractice, isPrivatePractice, practiceViewer } from "@/lib/practice/practice-access"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const practice = await prisma.practice.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      createdById: true,
      visibility: true,
      ownerId: true,
      published: true }})
  if (!practice || !canViewPractice(practice, practiceViewer(session))) {
    return NextResponse.json({ error: "Practice not found" }, { status: 404 })
  }
  if (isPrivatePractice(practice)) {
    return NextResponse.json({ error: "Private practices don't have comments" }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const text = String(body.body ?? "").trim()
  if (!text) return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 })
  if (text.length > 2000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 })
  }

  let parentId: string | null = null
  let parentAuthorId: string | null = null
  if (body.parentId != null && body.parentId !== "") {
    const parent = await prisma.practiceComment.findUnique({
      where: { id: String(body.parentId) },
      select: { id: true, practiceId: true, parentId: true, authorId: true }})
    if (!parent || parent.practiceId !== id) {
      return NextResponse.json({ error: "Parent comment not found" }, { status: 400 })
    }
    // Flatten to one level: replies attach to the top-level comment
    parentId = parent.parentId ?? parent.id
    if (parent.parentId) {
      const root = await prisma.practiceComment.findUnique({
        where: { id: parentId },
        select: { authorId: true }})
      parentAuthorId = root?.authorId ?? parent.authorId
    } else {
      parentAuthorId = parent.authorId
    }
  }

  const rateLimit = await checkCommentCreationRateLimit(session.user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `You're posting comments too quickly. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    )
  }

  const comment = await prisma.practiceComment.create({
    data: {
      practiceId: id,
      authorId: session.user.id,
      authorName: session.user.name ?? "Someone",
      body: text,
      parentId}})

  await notifyPracticeComment({
    practiceId: practice.id,
    practiceTitle: practice.title,
    commentBody: text,
    authorId: session.user.id,
    authorName: session.user.name ?? "Someone",
    practiceAuthorId: practice.createdById,
    parentAuthorId,
    isReply: parentId != null})

  return NextResponse.json(
    {
      ...comment,
      authorImage: session.user.image ?? null,
      authorStaffTitle: session.user.staffTitle ?? null,
    },
    { status: 201 }
  )
}
