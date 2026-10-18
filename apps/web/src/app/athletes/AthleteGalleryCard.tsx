import Link from "next/link"
import { athletePath } from "@/lib/slug"
import { AthleteAvatar, AthleteName, athleteMeta, type RosterAthlete } from "./roster-athlete"

/** Compact horizontal roster card: avatar, name, then "Year · Age · Gender". */
export default function AthleteGalleryCard({
  athlete,
  showGender,
  isYou,
  anchor,
}: {
  athlete: RosterAthlete
  showGender: boolean
  isYou: boolean
  /** Last-name initial when this is the first card of its letter (A–Z rail target). */
  anchor?: string
}) {
  const meta = athleteMeta(athlete, showGender)

  return (
    <Link
      id={anchor}
      href={athletePath(athlete.slug ?? athlete.id)}
      className={`flex min-w-0 scroll-mt-32 items-center gap-3 rounded-xl border px-4 py-3 shadow-sm transition-[background-color,box-shadow] hover:bg-background-hover hover:shadow-md ${
        isYou ? "border-primary bg-primary/5" : "border-border bg-background"
      }`}
    >
      <AthleteAvatar athlete={athlete} className="h-11 w-11 text-[15px]" />
      <div className="flex min-w-0 flex-col">
        <AthleteName athlete={athlete} className="text-[15px] leading-[22px]" />
        {meta && <p className="truncate text-[13px] leading-[18px] tabular-nums text-foreground-secondary">{meta}</p>}
      </div>
    </Link>
  )
}
