"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

/** Shared with PATCH /api/user/view-preference — same logic, kept in sync
 * manually since the route can't be refactored without risking the
 * mobile-facing contract. */

function normalizeView(value: unknown) {
  return value === "list" ? "list" : "gallery"
}

function normalizePracticesView(value: unknown) {
  return value === "week" || value === "month" || value === "list" ? value : "week"
}

export async function updateViewPreference(input: {
  defaultView?: string
  defaultPracticesView?: string
}) {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")

  const data: {
    defaultView?: "list" | "gallery"
    defaultPracticesView?: "week" | "month" | "list"
  } = {}
  if (input.defaultView) data.defaultView = normalizeView(input.defaultView)
  if (input.defaultPracticesView) {
    data.defaultPracticesView = normalizePracticesView(input.defaultPracticesView)
  }

  await prisma.user.update({ where: { id: session.user.id }, data })
  revalidatePath("/", "layout")
}
