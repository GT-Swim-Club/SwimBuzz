import { athleteStatusIcons, type AthleteClearanceSummary, type StaffTitle } from "@swimbuzz/shared"
import { athleteAge, formatAcademicYear } from "@/lib/utils"
import StaffBadge from "@/components/ui/StaffBadge"
import { AthleteStatusIcons } from "@/components/athlete/StatusIcon"

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
  /** Main profile first; empty when the athlete has no SwimCloud profile. */
  swimCloudIds: number[]
  /** When SwimCloud times were last imported; null if never. */
  timesSyncedAt: string | Date | null
  /** Physical & concussion test completion — staff viewers only (null for everyone else). */
  clearance: AthleteClearanceSummary | null
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
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/20 font-medium text-accent ${className}`}
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

/**
 * "First (Preferred) Last", then the staff badge and — for staff viewers (`showStatus`) — the
 * status icons (physical, concussion test, SwimCloud times), kept outside the truncated text so
 * their tooltips aren't clipped.
 */
export function AthleteName({
  athlete,
  className,
  showStatus = false,
}: {
  athlete: RosterAthlete
  className: string
  showStatus?: boolean
}) {
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
      {showStatus && <AthleteStatusIcons items={athleteStatusIcons(athlete)} className="ml-1.5" />}
    </p>
  )
}
