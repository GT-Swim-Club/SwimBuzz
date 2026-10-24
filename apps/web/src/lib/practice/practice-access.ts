import type { Prisma, PracticeVisibility } from "@prisma/client"
import type { Session } from "next-auth"
import { isStaffRole, type PracticeScope } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"

/** Live private practices one user may own. Keeps per-user storage bounded (~1 MB worst case). */
export const MAX_PRIVATE_PRACTICES_PER_USER = 50

export type PracticeViewer = { userId: string; isStaff: boolean }

type PracticeAccessFields = {
  visibility: PracticeVisibility
  ownerId: string | null
  published: boolean
}

export class PracticeVisibilityError extends Error {}

export function practiceViewer(session: Session): PracticeViewer {
  return { userId: session.user.id, isStaff: isStaffRole(session.user.role) }
}

export function parsePracticeScope(value: unknown): PracticeScope {
  return value === "team" || value === "mine" ? value : "all"
}

export function isPrivatePractice(practice: Pick<PracticeAccessFields, "visibility">): boolean {
  return practice.visibility === "PRIVATE"
}

/** Practices the viewer may see: team practices (published-only for athletes) plus their own private ones. */
export function practiceListWhere(
  viewer: PracticeViewer,
  scope: PracticeScope = "all"
): Prisma.PracticeWhereInput {
  const team: Prisma.PracticeWhereInput = {
    visibility: "TEAM",
    ...(viewer.isStaff ? {} : { published: true }),
  }
  const mine: Prisma.PracticeWhereInput = { visibility: "PRIVATE", ownerId: viewer.userId }
  if (scope === "team") return team
  if (scope === "mine") return mine
  return { OR: [team, mine] }
}

/** Private practices are owner-only — coaches included — so callers should answer 404, not 403. */
export function canViewPractice(practice: PracticeAccessFields, viewer: PracticeViewer): boolean {
  if (isPrivatePractice(practice)) return practice.ownerId === viewer.userId
  return viewer.isStaff || practice.published
}

export function canEditPractice(practice: PracticeAccessFields, viewer: PracticeViewer): boolean {
  if (isPrivatePractice(practice)) return practice.ownerId === viewer.userId
  return viewer.isStaff
}

export const practiceAccessSelect = { visibility: true, ownerId: true, published: true } as const

export function loadPracticeAccess(id: string): Promise<PracticeAccessFields | null> {
  return prisma.practice.findUnique({ where: { id }, select: practiceAccessSelect })
}

/** Null when allowed; otherwise the status/error a route should answer with. */
export function practiceAccessError(
  practice: PracticeAccessFields | null,
  viewer: PracticeViewer,
  mode: "view" | "edit"
): { status: 403 | 404; error: string } | null {
  if (!practice || !canViewPractice(practice, viewer)) return { status: 404, error: "Not found" }
  if (mode === "edit" && !canEditPractice(practice, viewer)) return { status: 403, error: "Forbidden" }
  return null
}

/**
 * Staff may flip their own unpublished drafts between team and private (the editor
 * autosaves before they'd otherwise get to choose). Athletes' requests are ignored —
 * their practices stay private. Throws PracticeVisibilityError with a user-facing reason.
 */
export function resolveVisibilityChange(
  existing: PracticeAccessFields & { createdById: string | null },
  requested: unknown,
  viewer: PracticeViewer
): PracticeVisibility {
  if (requested !== "TEAM" && requested !== "PRIVATE") return existing.visibility
  if (requested === existing.visibility || !viewer.isStaff) return existing.visibility
  if (requested === "PRIVATE") {
    if (existing.published) {
      throw new PracticeVisibilityError("Revert this practice to a draft before making it private.")
    }
    if (existing.createdById !== viewer.userId) {
      throw new PracticeVisibilityError("Only the coach who created this draft can make it private.")
    }
  }
  return requested
}

/** Athletes can only create private practices; staff choose. */
export function resolveNewPracticeVisibility(
  requested: unknown,
  viewer: PracticeViewer
): PracticeVisibility {
  if (!viewer.isStaff) return "PRIVATE"
  return requested === "PRIVATE" ? "PRIVATE" : "TEAM"
}

/**
 * Must run inside the same interactive transaction as the create: the advisory
 * lock serializes concurrent creates by one user so a double submit can't
 * slip past the cap.
 */
export async function assertPrivatePracticeQuota(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"private-practice:" + userId}))`
  const count = await tx.practice.count({ where: { visibility: "PRIVATE", ownerId: userId } })
  if (count >= MAX_PRIVATE_PRACTICES_PER_USER) {
    throw new PracticeVisibilityError(
      `You can have up to ${MAX_PRIVATE_PRACTICES_PER_USER} private practices. Delete an old private practice first.`
    )
  }
}
