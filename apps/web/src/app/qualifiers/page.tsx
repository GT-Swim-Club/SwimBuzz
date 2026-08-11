import { prisma } from "@/lib/prisma"
import LoadingComponent from "./loading"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { currentSeason, parseSeason } from "@/lib/season"
import { computeNationalsQualifiers } from "@/lib/nationals-qualifiers"
import { formatDateTime } from "@/lib/utils"
import { isStaffUi } from "@/lib/athlete-view-server"
import QualifierFilters from "./QualifierFilters"
import QualifiersList from "./QualifiersList"
import LiveSearch from "@/components/LiveSearch"
import {
  GalleryListViewToggle,
  ViewNavPanel,
  ViewNavigationProvider } from "@/components/ViewNavigation"
import StandardsTableModal from "./StandardsTableModal"
import UploadStandardsButton from "./UploadStandardsButton"
import { getSession } from "@/lib/session"

export const dynamic = 'force-dynamic'

async function QualifiersContent({ searchParams }: { searchParams: Promise<{ season?: string; gender?: string; view?: string; q?: string }> }) {
  const session = await getSession()
  if (!session) redirect("/signin")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { defaultView: true }})
  const defaultView = user?.defaultView ?? "gallery"

  const { season: seasonParam, gender, view, q: search } = await searchParams
  const activeView = view ? (view === "list" ? "list" : "gallery") : (defaultView === "list" ? "list" : "gallery")
  const season = parseSeason(seasonParam) ?? currentSeason()

  // ... (redirect logic was here)
  
  // Need to add search to redirect logic too to keep it in URL.
  // Actually, I'll just skip the normalization for search for now, to keep it simple.
  
  // ... (keep redirect logic as before, just need to update it to include search if I want it to be persistent)
  // Actually, wait, the `update` function in QualifierFilters already does this.

  if (!seasonParam || !gender || view === "list") {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all"})
    if (activeView !== defaultView) {
      params.set("view", activeView)
    }
    // If the URL had `view=list` but the default is `list`, we should remove it.
    // The current logic forces a redirect if view === 'list', which cleans it up.
    // However, if view === 'list' and default is 'list', redirect() to remove 'view' is good.
    // If view is missing, we only redirect if params are missing (season/gender).
    
    // Wait, the previous logic: if (!seasonParam || !gender || view === 'list') {
    // I should probably simplify this.
    
    // REDIRECT logic.
    // Let's refine the redirect condition.
    // If we have season and gender, and view is the default, we might still redirect to remove view from URL if it's there?
    // Let's keep it simple first: if season or gender missing, redirect.
    // If view is NOT default but NOT in URL, do we add it? Yes, for explicit URL state.
    // Actually, let's keep the existing redirect logic for now and tune it to use `defaultView` as the "hidden" view.

    // Redefine: Redir to normalize URL
    // If season/gender missing, add them.
    // If view is not default, add view.
    // If view is default AND in URL, remove view.
    
    // This is better done in `buildHref` and a separate normalization redirect.
  }
  
  // Let's stick to the current structure but use defaultView correctly.
  
  if (!seasonParam || !gender) {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all"})
    if (activeView !== defaultView) {
      params.set("view", activeView)
    }
    redirect(`/qualifiers?${params.toString()}`)
  }
  
  // If view is present but it's the default, remove it.
  if (view && view === defaultView) {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all"})
    redirect(`/qualifiers?${params.toString()}`)
  }

  const genderFilter = gender === "F" ? "F" : gender === "M" ? "M" : null
  const isCoach = await isStaffUi(session.user.role)
  const seasons = await prisma.season.findMany({
      orderBy: { label: "desc" }}).then(list => list.map(s => s.label))

  const currentUserAthlete = await prisma.athlete.findUnique({
    where: { userId: session.user.id }})
  const currentAthleteId = currentUserAthlete?.id

  const { set, qualifiers: rawQualifiers, qualifierCount, standards } = await computeNationalsQualifiers({
    season,
    gender: genderFilter})

  const qualifiersAll = [...rawQualifiers].sort((a, b) => {
    if (a.athleteId === currentAthleteId) return -1
    if (b.athleteId === currentAthleteId) return 1
    return 0
  })

  const qualifiers = qualifiersAll.filter(q => 
    q.firstName.toLowerCase().includes((search ?? "").toLowerCase()) ||
    q.lastName.toLowerCase().includes((search ?? "").toLowerCase()) ||
    q.events.some(ev => ev.event.toLowerCase().includes((search ?? "").toLowerCase()))
  )

  function buildHref(next: { view?: "gallery" | "list" }) {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all"})
    const v = next.view ?? activeView
    if (v !== defaultView) {
      params.set("view", v)
    }
    return `/qualifiers?${params.toString()}`
  }

  return (
    <ViewNavigationProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-medium text-foreground">Nationals Qualifiers</h1>
            <QualifierFilters qualifierCount={qualifiers.length} seasons={seasons} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <GalleryListViewToggle
              activeView={activeView}
              galleryHref={buildHref({ view: "gallery" })}
              listHref={buildHref({ view: "list" })}
            />
            {isCoach ? (
              <UploadStandardsButton season={season} course={set?.course ?? "SCY"} />
            ) : null}
          </div>
        </div>

        {set ? (
          <p className="flex flex-col gap-1 text-sm text-foreground-secondary sm:block">
            <span>
              Nationals
              {set.yearLabel ? ` ${set.yearLabel}` : ""} · {set.course}
            </span>
            <span className="hidden sm:inline"> · </span>
            <StandardsTableModal
              yearLabel={set.yearLabel}
              course={set.course}
              sourceUrl={set.sourceUrl}
              rows={standards}
            />
            <span className="hidden sm:inline"> · </span>
            <span>Updated {formatDateTime(set.updatedAt)}</span>
          </p>
        ) : (
          <p className="text-sm text-foreground-secondary">
            No time standards uploaded for {season} yet.
            {isCoach
              ? " Upload a Nationals qualifying times PDF to see who has made cuts from this season’s meets."
              : " Ask a coach to upload the Nationals qualifying times PDF."}
          </p>
        )}

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
      </div>
    </ViewNavigationProvider>
  )
}

export default async function QualifiersPage(props: { searchParams: Promise<{ season?: string; gender?: string; q?: string }> }) {
    return (
        <main className="space-y-6">
            <Suspense fallback={<LoadingComponent />}>
                <QualifiersContent {...props} />
            </Suspense>
        </main>
    )
}
