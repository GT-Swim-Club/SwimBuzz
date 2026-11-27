import type { Metadata } from "next"
import { athletePreferredName } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { canViewPractice, practiceAccessSelect } from "@/lib/practice/practice-access"
import { isCuid } from "@/lib/slug"

/*
 * Browser-tab titles for detail pages ("War Eagle 2024 | SwimBuzz" — the
 * " | SwimBuzz" suffix comes from the root layout's title template). Each
 * lookup is a one-column query by slug/id, and falls back to the section name
 * when the viewer is signed out or can't see the item, so a tab never leaks the
 * name of something the page itself would 404 on.
 */

function whereParam(param: string) {
  return isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param }
}

/** "<prefix> · <name>" when there's a prefix (e.g. "Relays · War Eagle 2024"). */
function titled(name: string | null, fallback: string, prefix?: string): Metadata {
  if (!name) return { title: fallback }
  return { title: prefix ? `${prefix} · ${name}` : name }
}

export async function meetPageMetadata(param: string, prefix?: string): Promise<Metadata> {
  const session = await getSession()
  const meet = session
    ? await prisma.meet.findFirst({ where: whereParam(param), select: { name: true } })
    : null
  return titled(meet?.name ?? null, "Meets", prefix)
}

export async function athletePageMetadata(param: string): Promise<Metadata> {
  const session = await getSession()
  const athlete = session
    ? await prisma.athlete.findFirst({
        where: whereParam(param),
        select: { firstName: true, lastName: true, preferredName: true },
      })
    : null
  return titled(athlete ? athletePreferredName(athlete) : null, "Roster")
}

export async function practicePageMetadata(param: string, prefix?: string): Promise<Metadata> {
  const session = await getSession()
  if (!session) return titled(null, "Practices", prefix)
  const [practice, isStaff] = await Promise.all([
    prisma.practice.findFirst({
      where: whereParam(param),
      select: { title: true, ...practiceAccessSelect },
    }),
    isStaffUi(session.user.role),
  ])
  const visible = practice && canViewPractice(practice, { userId: session.user.id, isStaff })
  return titled(visible ? practice.title : null, "Practices", prefix)
}
