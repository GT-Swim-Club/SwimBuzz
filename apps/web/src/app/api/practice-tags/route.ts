import { NextResponse as ServerResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { listManagedPracticeTags } from "@/lib/practice/practice-tag-catalog"
import { normalizeTag, PRACTICE_TAG_MAX_COUNT, PRACTICE_TAG_NAME_MAX_LENGTH } from "@/lib/practice/practice-tags"

const respond = (body: unknown, status = 200) => ServerResponse.json(body, { status })

export async function GET() {
  const session = await getSession()
  if (!session) return respond({ error: "Unauthorized" }, 401)
  return respond(await listManagedPracticeTags())
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return respond({ error: "Forbidden" }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const name = normalizeTag(String(body?.name ?? ""))
  if (!name) return respond({ error: "Enter a tag name" }, 400)
  if (name.length > PRACTICE_TAG_NAME_MAX_LENGTH) {
    return respond(
      { error: "Tags must be " + PRACTICE_TAG_NAME_MAX_LENGTH + " characters or fewer" },
      400
    )
  }

  const managedTags = await listManagedPracticeTags()
  const existingEntry = managedTags.find(
    (tag) => tag.name.toLowerCase() === name.toLowerCase()
  )
  if (existingEntry) return respond({ error: "That tag already exists" }, 409)
  if (managedTags.length >= PRACTICE_TAG_MAX_COUNT) {
    return respond(
      { error: "A maximum of " + PRACTICE_TAG_MAX_COUNT + " practice tags is allowed" },
      400
    )
  }

  const createdEntry = await prisma.practiceTag.create({
    data: { name },
    select: { id: true, name: true },
  })
  return respond(createdEntry, 201)
}
