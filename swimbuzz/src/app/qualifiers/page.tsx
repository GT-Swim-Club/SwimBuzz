import { Suspense } from "react"
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

export default async function QualifiersPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; gender?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/signin")

  const { season: seasonParam, gender } = await searchParams
  const season = parseSeason(seasonParam) ?? currentSeason()

  if (!seasonParam || !gender) {
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

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-medium">Nationals Qualifiers</h1>
          <Suspense fallback={null}>
            <QualifierFilters qualifierCount={qualifierCount} />
          </Suspense>
        </div>
        {isCoach ? (
          <UploadStandardsButton season={season} course={set?.course ?? "SCY"} />
        ) : null}
      </div>

      {set ? (
        <p className="flex flex-col gap-1 text-sm text-gray-500 dark:text-zinc-400 sm:block">
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
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          No time standards uploaded for {season} yet.
          {isCoach
            ? " Upload a Nationals qualifying times PDF to see who has made cuts from this season’s meets."
            : " Ask a coach to upload the Nationals qualifying times PDF."}
        </p>
      )}

      <QualifiersList
        qualifiers={qualifiers}
        emptyMessage={
          set
            ? "No athletes have made an individual Nationals cut from meets in this season yet."
            : "Upload standards to start tracking qualifiers."
        }
      />
    </main>
  )
}
