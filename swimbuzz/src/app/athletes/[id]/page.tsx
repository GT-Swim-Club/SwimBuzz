import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { compareSwimPb } from "@/lib/swim-parse"
import AddSwimForm from "./AddSwimForm"
import PersonalBestsGrid from "./PersonalBestsGrid"
import SwimHistory from "./SwimHistory"
import EditNicknamesForm from "@/components/EditNicknamesForm"
import RequestTimesImportButton from "@/components/RequestTimesImportButton"
import AthleteActions from "./AthleteActions"
import PendingProfileChangesReview from "@/components/PendingProfileChangesReview"
import { isStaffUi } from "@/lib/athlete-view-server"
import { parsePendingProfileChanges } from "@/lib/pending-profile-changes"

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params  // 👈 await it
    const session = await getServerSession(authOptions)
    if (!session) redirect("/signin")

    const athlete = await prisma.athlete.findUnique({
        where: { id },  // 👈 use the destructured id
        include: {
        user: { select: { name: true, email: true, image: true } },
        swims: {
            orderBy: { date: "desc" },
        },
        },
    })

    if (!athlete) notFound()

  const isCoach = await isStaffUi(session.user.role)
  const isOwnProfile = athlete.userId === session.user.id
  const pending = parsePendingProfileChanges(athlete.pendingProfileChanges)

  // group PBs by event
  const pbMap = new Map<string, typeof athlete.swims[0]>()
  for (const swim of [...athlete.swims].sort((a, b) => a.timeMs - b.timeMs)) {
    const key = `${swim.event}-${swim.course}`
    if (!pbMap.has(key)) pbMap.set(key, swim)
  }

  const personalBests = [...pbMap.values()].sort(compareSwimPb)

  const historySwims = athlete.swims.map((swim) => ({
    id: swim.id,
    event: swim.event,
    course: swim.course,
    timeMs: swim.timeMs,
    tags: swim.tags ?? "",
    meet: swim.meet ?? "",
    date: swim.date.toISOString(),
    source: swim.source,
  }))

  const rosterHref = `/athletes?gender=${athlete.gender}`

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <Link
          href={rosterHref}
          className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
        >
          ← Roster
        </Link>
        <div className="mt-1 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-indigo-100 font-medium text-indigo-700 dark:border-zinc-700 dark:bg-indigo-950 dark:text-indigo-200">
            {athlete.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={athlete.user.image}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span aria-hidden>
                {athlete.firstName[0]}
                {athlete.lastName[0]}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-medium">
              {athlete.swimCloudId ? (
                <a
                  href={`https://www.swimcloud.com/swimmer/${athlete.swimCloudId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {athlete.firstName} {athlete.lastName}
                </a>
              ) : (
                <>
                  {athlete.firstName} {athlete.lastName}
                </>
              )}
              {athlete.nicknames.length > 0 && (
                <span className="font-normal text-gray-500 dark:text-zinc-400">
                  {" "}({athlete.nicknames.join(", ")})
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">{athlete.user?.email}</p>
            {athlete.swimCloudId && (
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                SwimCloud ID: {athlete.swimCloudId}
              </p>
            )}
          </div>
          {isCoach ? (
            <AthleteActions
              athleteId={athlete.id}
              firstName={athlete.firstName}
              lastName={athlete.lastName}
              email={athlete.user?.email ?? ""}
              swimCloudId={athlete.swimCloudId ?? null}
            />
          ) : isOwnProfile ? (
            <Link
              href="/settings"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Edit profile
            </Link>
          ) : null}
        </div>
      </div>

      {isCoach && pending && (
        <PendingProfileChangesReview
          athleteId={athlete.id}
          pending={pending}
          currentSwimCloudId={athlete.swimCloudId ?? null}
          currentNicknames={athlete.nicknames}
        />
      )}

      {/* PB grid */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-4">
          Personal bests
        </h2>
        <PersonalBestsGrid swims={personalBests} />
      </section>

      {/* Swim history */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
          History
        </h2>
        <SwimHistory swims={historySwims} isCoach={isCoach} />
      </section>
      
      {isCoach && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
            Alternate names
          </h2>
          <EditNicknamesForm
            athleteId={athlete.id}
            initialNicknames={athlete.nicknames}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
            Names used to match imported results to this athlete.
          </p>
        </section>
      )}

      {isCoach && (
        <AddSwimForm
          athleteId={athlete.id}
          swimCloudId={athlete.swimCloudId ?? null}
          timesSyncedAt={athlete.timesSyncedAt?.toISOString() ?? null}
        />
      )}

      {!isCoach && isOwnProfile && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
            Import from SwimCloud
          </h2>
          <RequestTimesImportButton
            athleteId={athlete.id}
            hasSwimCloudId={athlete.swimCloudId != null}
            timesSyncedAt={athlete.timesSyncedAt?.toISOString() ?? null}
          />
        </section>
      )}
    </main>
  )
}