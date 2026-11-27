import { notFound, redirect } from "next/navigation"
import BackLink from "@/components/ui/BackLink"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { isCuid, practicePath } from "@/lib/slug"
import { seasonFromDate } from "@/lib/season"
import { athleteYearForSeason, zonedDayKey, isStaffRole } from "@swimbuzz/shared"
import { serializeAttendance } from "@/lib/practice/practice-attendance"
import { missingClearanceByAthlete, withAttendanceClearance } from "@/lib/athlete/athlete-clearance"
import AttendanceManager from "./AttendanceManager"
import AttendanceList from "./AttendanceList"
import { practicePageMetadata } from "@/lib/page-title"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id: param } = await params
  return practicePageMetadata(param, "Attendance")
}

export default async function PracticeAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/signin?callbackUrl=/practices/${encodeURIComponent(param)}/attendance`)
  }
  const [isCoach, practice] = await Promise.all([
    isStaffUi(session.user.role),
    prisma.practice.findFirst({
      where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
      select: {
        id: true,
        slug: true,
        title: true,
        published: true,
        visibility: true,
        ownerId: true,
        createdAt: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        location: true,
        attendance: {
          orderBy: { recordedAt: "desc" },
          include: {
            athlete: {
              select: {
                slug: true,
                firstName: true,
                lastName: true,
                gender: true,
                year: true,
                yearBySeason: true,
                seasons: true,
                user: { select: { staffTitle: true } },
              },
            },
          },
        },
      },
    }),
    // Athletes' "you" lookup doesn't need the practice; resolveViewerAthleteId is cache()d, so the
    // call below reuses this one.
    isStaffRole(session.user.role) ? null : resolveViewerAthleteId(session.user.id),
  ])

  // Athletes see attendance only for practices they can otherwise view. Private practices have none.
  if (!practice) notFound()
  if (practice.visibility !== "TEAM") {
    if (practice.ownerId === session.user.id) redirect(practicePath(practice.id))
    notFound()
  }
  if (!practice.published && !isCoach) {
    // Staff who switched into Athlete View on a draft: send them to the list, not a 404.
    if (isStaffRole(session.user.role)) redirect("/practices")
    notFound()
  }
  const detailPath = practicePath(practice.slug ?? practice.id)
  if (practice.slug && param !== practice.slug) redirect(`${detailPath}/attendance`)

  const initialAttendance = practice.attendance.map(serializeAttendance)
  const startsAt = practice.startsAt ?? practice.createdAt
  const endsAt = practice.endsAt ?? startsAt

  if (!isCoach) {
    const viewerAthleteId = await resolveViewerAthleteId(session.user.id)
    return (
      <main className="mx-auto w-full max-w-4xl space-y-5">
        <BackLink
          fallbackHref={detailPath}
          fallbackLabel={practice.title}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground-tertiary transition-colors hover:text-foreground"
        />
        <AttendanceList
          title={practice.title}
          startsAt={startsAt.toISOString()}
          endsAt={endsAt.toISOString()}
          timeZone={practice.timeZone}
          location={practice.location}
          attendance={initialAttendance}
          viewerAthleteId={viewerAthleteId}
        />
      </main>
    )
  }

  // Manual check-in searches the roster for the season this practice falls in;
  // fall back to the whole roster when that season has no athletes yet.
  const season = seasonFromDate(zonedDayKey(startsAt, practice.timeZone))
  const seasonRoster = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: { id: true, slug: true, firstName: true, lastName: true, preferredName: true, gender: true, year: true, yearBySeason: true, seasons: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
  const roster =
    seasonRoster.length > 0
      ? seasonRoster
      : await prisma.athlete.findMany({
          select: { id: true, slug: true, firstName: true, lastName: true, preferredName: true, gender: true, year: true, yearBySeason: true, seasons: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })
  // Staff only: flag athletes without a physical or concussion test for this season.
  const [flaggedAttendance, missingClearance] = await Promise.all([
    withAttendanceClearance(initialAttendance),
    missingClearanceByAthlete(roster.map((a) => a.id)),
  ])

  return (
    <main className="mx-auto w-full max-w-4xl">
      <div>
        <BackLink
          fallbackHref={detailPath}
          fallbackLabel={practice.title}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground-tertiary transition-colors hover:text-foreground"
        />
        <div className="mt-1">
          <AttendanceManager
        practiceId={practice.id}
        title={practice.title}
        startsAt={startsAt.toISOString()}
        endsAt={endsAt.toISOString()}
        timeZone={practice.timeZone}
        location={practice.location}
        initialAttendance={flaggedAttendance}
        season={season}
        roster={roster.map((a) => ({
          uncleared: missingClearance.get(a.id) ?? [],
          id: a.id,
          slug: a.slug,
          name: `${a.firstName} ${a.lastName}`.trim(),
          preferredName: a.preferredName,
          gender: a.gender === "F" ? "F" : "M",
          year: athleteYearForSeason(a, season),
        }))}
          />
        </div>
      </div>
    </main>
  )
}
