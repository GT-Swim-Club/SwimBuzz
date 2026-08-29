import { notFound, redirect } from "next/navigation"
import BackLink from "@/components/BackLink"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete-view-server"
import { isCuid, practicePath } from "@/lib/slug"
import { seasonFromDate } from "@/lib/season"
import { zonedDayKey } from "@swimbuzz/shared"
import { serializeAttendance } from "@/lib/practice-attendance"
import AttendanceManager from "./AttendanceManager"
import AttendanceList from "./AttendanceList"

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
  const isCoach = await isStaffUi(session.user.role)

  const practice = await prisma.practice.findFirst({
    where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
    select: {
      id: true,
      slug: true,
      title: true,
      published: true,
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
              user: { select: { staffTitle: true } },
            },
          },
        },
      },
    },
  })

  // Athletes see attendance only for practices they can otherwise view.
  if (!practice || (!practice.published && !isCoach)) notFound()
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
    select: { id: true, slug: true, firstName: true, lastName: true, nicknames: true, gender: true, year: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
  const roster =
    seasonRoster.length > 0
      ? seasonRoster
      : await prisma.athlete.findMany({
          select: { id: true, slug: true, firstName: true, lastName: true, nicknames: true, gender: true, year: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })

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
        initialAttendance={initialAttendance}
        roster={roster.map((a) => ({
          id: a.id,
          slug: a.slug,
          name: `${a.firstName} ${a.lastName}`.trim(),
          nicknames: a.nicknames,
          gender: a.gender === "F" ? "F" : "M",
          year: a.year,
        }))}
          />
        </div>
      </div>
    </main>
  )
}
