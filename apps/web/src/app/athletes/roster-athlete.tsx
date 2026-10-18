import type { StaffTitle } from "@swimbuzz/shared"
import { athleteAge, formatAcademicYear } from "@/lib/utils"
import StaffBadge from "@/components/ui/StaffBadge"

/** The roster page's athlete row, as selected in page.tsx. */
export type RosterAthlete = {
  id: string
  slug: string | null
  firstName: string
  lastName: string
  preferredName: string | null
  gender: string
  year: string | null
  dob: string | Date | null
  user: { image: string | null; staffTitle: StaffTitle | null } | null
}

export function genderLabel(gender: string) {
  return gender === "F" ? "Women" : "Men"
}

export function athleteYear(athlete: RosterAthlete) {
  return athlete.year ? formatAcademicYear(athlete.year) : null
}

/** "2nd Year · 19 · Men" — the details shown under a name when there are no columns for them. */
export function athleteMeta(athlete: RosterAthlete, showGender: boolean) {
  const age = athleteAge(athlete.dob)
  return [athleteYear(athlete), age != null ? String(age) : null, showGender ? genderLabel(athlete.gender) : null]
    .filter(Boolean)
    .join(" · ")
}

export function AthleteAvatar({ athlete, className }: { athlete: RosterAthlete; className: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/20 font-medium text-primary ${className}`}
    >
      {athlete.user?.image ? (
        <img src={athlete.user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>
          {athlete.firstName[0]}
          {athlete.lastName[0]}
        </span>
      )}
    </div>
  )
}

/** "First (Preferred) Last" with the staff badge kept outside the truncated text so its tooltip isn't clipped. */
export function AthleteName({ athlete, className }: { athlete: RosterAthlete; className: string }) {
  return (
    <p className={`flex min-w-0 items-center font-medium text-foreground ${className}`}>
      <span className="truncate">
        {athlete.firstName}
        {athlete.preferredName && (
          <span className="font-normal text-foreground-secondary"> ({athlete.preferredName})</span>
        )}{" "}
        {athlete.lastName}
      </span>
      {athlete.user?.staffTitle && <StaffBadge title={athlete.user.staffTitle} className="shrink-0" />}
    </p>
  )
}
