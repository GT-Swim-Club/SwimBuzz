import { prisma } from "@/lib/prisma"
import LoadingComponent from "./loading"
import { Suspense } from "react"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { currentSeason, parseSeason } from "@/lib/season"
import { computeNationalsQualifiers } from "@/lib/nationals-qualifiers"
import { formatDateTime } from "@/lib/utils"
import { isStaffUi } from "@/lib/athlete-view-server"
import QualifierFilters from "./QualifierFilters"
import QualifiersList from "./QualifiersList"
import StandardsTableModal from "./StandardsTableModal"
import UploadStandardsButton from "./UploadStandardsButton"

export const dynamic = 'force-dynamic'

async function QualifiersContent({ searchParams }: { searchParams: Promise<{ season?: string; gender?: string; view?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/signin")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { defaultView: true },
  })
  const defaultView = user?.defaultView ?? "gallery"

  const { season: seasonParam, gender, view } = await searchParams
  const activeView = view ? (view === "list" ? "list" : "gallery") : (defaultView === "list" ? "list" : "gallery")
  const season = parseSeason(seasonParam) ?? currentSeason()

  if (!seasonParam || !gender || view === "list") {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all",
    })
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
      gender: gender ?? "all",
    })
    if (activeView !== defaultView) {
      params.set("view", activeView)
    }
    redirect(`/qualifiers?${params.toString()}`)
  }
  
  // If view is present but it's the default, remove it.
  if (view && view === defaultView) {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all",
    })
    redirect(`/qualifiers?${params.toString()}`)
  }

  const genderFilter = gender === "F" ? "F" : gender === "M" ? "M" : null
  const isCoach = await isStaffUi(session.user.role)

  const { set, qualifiers, qualifierCount, standards } = await computeNationalsQualifiers({
    season,
    gender: genderFilter,
  })

  function buildHref(next: { view?: "gallery" | "list" }) {
    const params = new URLSearchParams({
      season,
      gender: gender ?? "all",
    })
    const v = next.view ?? activeView
    if (v !== defaultView) {
      params.set("view", v)
    }
    return `/qualifiers?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-medium text-foreground">Nationals Qualifiers</h1>
          <QualifierFilters qualifierCount={qualifierCount} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-border bg-background p-1 text-sm">
            <Link
              href={buildHref({ view: "gallery" })}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${activeView === "gallery" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:border-border hover:bg-fill-secondary"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </Link>
            <Link
              href={buildHref({ view: "list" })}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${activeView === "list" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:border-border hover:bg-fill-secondary"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path d="M8 6h13" />
                <path d="M8 12h13" />
                <path d="M8 18h13" />
                <path d="M3 6h.01" />
                <path d="M3 12h.01" />
                <path d="M3 18h.01" />
              </svg>
            </Link>
          </div>
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

      <QualifiersList
        qualifiers={qualifiers}
        view={activeView}
        emptyMessage={
          set
            ? "No athletes have made an individual Nationals cut from meets in this season yet."
            : "Upload standards to start tracking qualifiers."
        }
      />
    </div>
  )
}

export default async function QualifiersPage(props: { searchParams: Promise<{ season?: string; gender?: string }> }) {
    return (
        <main className="space-y-6">
            <Suspense fallback={<LoadingComponent />}>
                <QualifiersContent {...props} />
            </Suspense>
        </main>
    )
}
