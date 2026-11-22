// import { withDeleted } from "../../soft-delete-policy"
// import { prisma } from "@/lib/prisma"
import { DEFAULT_TIME_ZONE, zonedDayKey } from "@swimbuzz/shared"

const CUID_RE = /^c[a-z0-9]{24}$/i

export function isCuid(value: string): boolean {
  return CUID_RE.test(value)
}

export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  )
}

export function athleteSlugBase(firstName: string, lastName: string): string {
  return slugify(`${firstName}-${lastName}`)
}

export function meetSlugBase(name: string): string {
  return slugify(name)
}

export function athletePath(slug: string): string {
  return `/athletes/${slug}`
}

export function meetPath(slug: string): string {
  return `/meets/${slug}`
}

export function meetSwimPath(meetSlug: string, swimId: string): string {
  return `${meetPath(meetSlug)}#swim-${swimId}`
}

/**
 * A relay team's anchor on its meet page, from its team key (relayTeamKey: event | letter | round |
 * gender): "400 Free Relay|A|F|M" → "relay-400-free-relay-a-f-m". Its row opens from it.
 */
export function relayAnchorId(teamKey: string): string {
  return `relay-${teamKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`
}

export function meetRelayPath(meetSlug: string, teamKey: string): string {
  return `${meetPath(meetSlug)}#${relayAnchorId(teamKey)}`
}

export function practiceSlugBase(startsAt: Date | null, timeZone: string): string {
  if (!startsAt) return "undated"
  return zonedDayKey(startsAt, timeZone)
}

export function practicePath(slug: string): string {
  return `/practices/${slug}`
}

export function practiceEditPath(slug: string): string {
  return `/practices/${slug}/edit`
}

export async function uniquePracticeSlug(
  startsAt: Date | null,
  timeZone: string,
  excludeId?: string
): Promise<string> {
  const { withDeleted } = await import("../../soft-delete-policy")
  const { prisma } = await import("@/lib/prisma")
  const base = practiceSlugBase(startsAt, timeZone)
  let slug = base
  let n = 2
  while (
    await withDeleted(() => prisma.practice.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    }))
  ) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

export async function uniqueAthleteSlug(
  firstName: string,
  lastName: string,
  excludeId?: string
): Promise<string> {
  const { prisma } = await import("@/lib/prisma")
  const base = athleteSlugBase(firstName, lastName)
  let slug = base
  let n = 2
  while (
    await prisma.athlete.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

/** The meet's start year in its own time zone ("2027"), or null with no start date. */
function meetSlugYear(startsAt: Date | null | undefined, timeZone: string | null | undefined): string | null {
  return startsAt ? zonedDayKey(startsAt, timeZone || DEFAULT_TIME_ZONE).slice(0, 4) : null
}

/**
 * A free slug for a meet: its name then its start year ("sting-em-classic-2027"), or just the name
 * when it already ends in that year or the meet has no start date. One taken by another meet
 * (deleted ones included) gets a counter ("…-2027-2").
 */
export async function uniqueMeetSlug(
  name: string,
  opts: { startsAt?: Date | null; timeZone?: string | null; excludeId?: string } = {}
): Promise<string> {
  const { withDeleted } = await import("../../soft-delete-policy")
  const { prisma } = await import("@/lib/prisma")
  const { startsAt, timeZone, excludeId } = opts
  const taken = (slug: string) =>
    withDeleted(() =>
      prisma.meet.findFirst({
        where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      })
    )
  const nameSlug = meetSlugBase(name)
  const year = meetSlugYear(startsAt, timeZone)
  const base = year && !nameSlug.endsWith(`-${year}`) ? `${nameSlug}-${year}` : nameSlug
  let slug = base
  for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`
  return slug
}

export async function athleteHrefForId(athleteId: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma")
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { slug: true },
  })
  return athletePath(athlete?.slug ?? athleteId)
}

export async function meetHrefForId(meetId: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma")
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { slug: true },
  })
  return meetPath(meet?.slug ?? meetId)
}

export async function meetSwimHrefForId(meetId: string, swimId: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma")
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { slug: true },
  })
  return meetSwimPath(meet?.slug ?? meetId, swimId)
}

export async function practiceHrefForId(practiceId: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma")
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { slug: true },
  })
  return practicePath(practice?.slug ?? practiceId)
}
