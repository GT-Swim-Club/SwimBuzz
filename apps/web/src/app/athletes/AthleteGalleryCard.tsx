import Link from "next/link"
import type { StaffTitle } from "@swimbuzz/shared"
import { athletePath } from "@/lib/slug"
import { formatAthleteYearAndAge } from "@/lib/utils"
import StaffBadge from "@/components/StaffBadge"

export default function AthleteGalleryCard({
  athlete,
  showGender,
  isYou,
}: {
  athlete: {
    id: string
    slug: string | null
    firstName: string
    lastName: string
    user: { image: string | null; email: string | null; staffTitle?: StaffTitle | null } | null
    nicknames: string[]
    gender: string
    swimCloudId: number | null
    year: string | null
    dob: string | Date | null
  }
  showGender: boolean
  isYou?: boolean
}) {
  const yearAndAge = formatAthleteYearAndAge(athlete.year, athlete.dob)

  return (
    <Link
      href={athletePath(athlete.slug ?? athlete.id)}
      className={`group flex h-full flex-col items-center overflow-hidden rounded-xl border p-4 text-center transition-all ${
        isYou
          ? "border-primary bg-primary/5 shadow-sm hover:shadow-md"
          : "border-border bg-background shadow-sm hover:border-border hover:bg-fill-secondary hover:shadow-md"
      }`}
    >
      <div className="mb-4 h-20 w-20 overflow-hidden rounded-full border border-primary/30 bg-primary/20">
        {athlete.user?.image ? (
          <img
            src={athlete.user.image}
            alt={`${athlete.firstName} ${athlete.lastName}`}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-primary">
            {athlete.firstName[0]}
            {athlete.lastName[0]}
          </div>
        )}
      </div>
      <h3 className="text-base font-medium text-foreground">
        {athlete.firstName}
        {athlete.nicknames.length > 0 ? (
          <span className="font-normal text-foreground-secondary">
            {" "}({athlete.nicknames.join(", ")})
          </span>
        ) : null}{" "}
        {athlete.lastName}
        {athlete.user?.staffTitle && <StaffBadge title={athlete.user.staffTitle} />}
      </h3>
      <div className="mt-1 w-full space-y-0.5 text-sm text-foreground-secondary">
        {yearAndAge ? <p className="truncate">{yearAndAge}</p> : null}
        {showGender ? (
          <p className="font-medium uppercase tracking-wide text-foreground-tertiary">
            {athlete.gender === "F" ? "Women" : "Men"}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
