import { prisma } from "@/lib/prisma"

const COMMENT_WINDOW_MS = 60_000
const MAX_COMMENTS_PER_WINDOW = 5

type CommentCreationRateLimit =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

/**
 * Limits each signed-in user to five new comments or replies per rolling minute.
 * Persisting the check against comment timestamps keeps the limit effective across
 * server instances and process restarts without adding another datastore.
 */
export async function checkCommentCreationRateLimit(
  authorId: string
): Promise<CommentCreationRateLimit> {
  const now = Date.now()
  const recentComments = await prisma.practiceComment.findMany({
    where: {
      authorId,
      createdAt: { gte: new Date(now - COMMENT_WINDOW_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_COMMENTS_PER_WINDOW,
    select: { createdAt: true },
  })

  if (recentComments.length < MAX_COMMENTS_PER_WINDOW) {
    return { allowed: true }
  }

  const oldestRecentComment = recentComments[0]
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (oldestRecentComment.createdAt.getTime() + COMMENT_WINDOW_MS - now) / 1000
    )
  )
  return { allowed: false, retryAfterSeconds }
}
