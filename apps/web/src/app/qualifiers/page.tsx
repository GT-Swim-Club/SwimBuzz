import { prisma } from "@/lib/prisma"
import LoadingComponent from "./loading"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { parseSeason, resolveListedSeason } from "@/lib/season"
import { computeNationalsQualifiers } from "@/lib/nationals-qualifiers"
import { isStaffUi } from "@/lib/athlete-view-server"
import QualifierFilters from "./QualifierFilters"
import QualifiersList from "./QualifiersList"
import LiveSearch from "@/components/LiveSearch"
import {
  GalleryListViewToggle,
  ViewNavPanel,
  ViewNavigationProvider,
} from "@/components/ViewNavigation"
import StandardsTableModal from "./StandardsTableModal"
import UploadStandardsButton from "./UploadStandardsButton"
import { getSession } from "@/lib/session"

export const dynamic = "force-dynamic"

async function QualifiersContent({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string
    gender?: string
    view?: string
    q?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect("/signin")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { defaultView: true },
  })
  const defaultView = user?.defaultView === "list" ? "list" : "gallery"
  const { season: seasonParam, gender, view, q: search } = await searchParams
  const activeView = view === "list" ? "list" : view === "gallery" ? "gallery" : defaultView
  const seasons = await prisma.season
    .findMany({ orderBy: { label: "desc" } })
    .then((list) => list.map((item) => item.label))
  const requestedSeason = parseSeason(seasonParam)
  const season = resolveListedSeason(requestedSeason, seasons)

  if (!seasonParam || requestedSeason !== season || !gender || view === defaultView) {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all",
    })
    if (search) params.set("q", search)
    if (activeView !== defaultView) params.set("view", activeView)
    redirect(`/qualifiers?${params.toString()}`)
  }

  const genderFilter = gender === "F" ? "F" : gender === "M" ? "M" : null
  const isCoach = await isStaffUi(session.user.role)
  const currentUserAthlete = await prisma.athlete.findUnique({
    where: { userId: session.user.id },
  })
  const currentAthleteId = currentUserAthlete?.id

  const { set, qualifiers: rawQualifiers } = await computeNationalsQualifiers({
    season,
    gender: genderFilter,
  })
  const qualifiersAll = [...rawQualifiers].sort((a, b) => {
    if (a.athleteId === currentAthleteId) return -1
    if (b.athleteId === currentAthleteId) return 1
    return 0
  })
  const normalizedSearch = (search ?? "").toLowerCase()
  const qualifiers = qualifiersAll.filter(
    (athlete) =>
      athlete.firstName.toLowerCase().includes(normalizedSearch) ||
      athlete.lastName.toLowerCase().includes(normalizedSearch) ||
      athlete.events.some((event) => event.event.toLowerCase().includes(normalizedSearch))
  )

  function buildHref(next: { view?: "gallery" | "list" }) {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all",
    })
    if (search) params.set("q", search)
    const nextView = next.view ?? activeView
    if (nextView !== defaultView) params.set("view", nextView)
    return `/qualifiers?${params.toString()}`
  }

  return (
    <ViewNavigationProvider>
      <div className="space-y-4">
        <h1 className="sr-only">Nationals Qualifiers</h1>
        <section className="flex flex-wrap items-center gap-3">
          <span className="text-lg font-medium text-foreground-secondary">
            {qualifiers.length} qualifier{qualifiers.length === 1 ? "" : "s"}
          </span>
          <QualifierFilters seasons={seasons} />
          {set ? (
            <StandardsTableModal
                yearLabel={set.yearLabel}
                sourceUrl={set.sourceUrl}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <GalleryListViewToggle
              activeView={activeView}
              galleryHref={buildHref({ view: "gallery" })}
              listHref={buildHref({ view: "list" })}
            />
            {isCoach ? <UploadStandardsButton season={season} course={set?.course ?? "SCY"} /> : null}
          </div>
        </section>

        {!set ? (
          <p className="text-sm text-foreground-secondary">
            No time standards have been uploaded for {season} yet.
            {isCoach
              ? " Upload a Nationals qualifying-times PDF to begin tracking cuts."
              : " Ask a coach to upload the qualifying-times PDF."}
          </p>
        ) : null}

        <section className="space-y-3">
          <LiveSearch pathname="/qualifiers" placeholder="Search athletes or events..." />
          <ViewNavPanel>
            <QualifiersList
              qualifiers={qualifiers}
              currentUserAthleteId={currentAthleteId}
              view={activeView}
              emptyMessage={
                set
                  ? "No athletes have made an individual Nationals cut from meets in this season yet."
                  : "Upload standards to start tracking qualifiers."
              }
            />
          </ViewNavPanel>
        </section>
      </div>
    </ViewNavigationProvider>
  )
}

export default async function QualifiersPage(props: {
  searchParams: Promise<{ season?: string; gender?: string; view?: string; q?: string }>
}) {
  return (
    <main className="space-y-4">
      <Suspense fallback={<LoadingComponent />}>
        <QualifiersContent {...props} />
      </Suspense>
    </main>
  )
}
