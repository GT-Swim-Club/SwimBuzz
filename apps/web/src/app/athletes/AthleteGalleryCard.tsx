import Link from "next/link"
import { athletePath } from "@/lib/slug"
import { AthleteAvatar, AthleteName, athleteMeta, type RosterAthlete } from "./roster-athlete"

/** Card body/avatar sizing, shared with the gallery skeleton (inside an `@container`). */
export const GALLERY_CARD_BODY =
  "flex items-center gap-3 px-4 py-3 xl:@[290px]:gap-4 xl:@[290px]:px-5 xl:@[290px]:py-5 xl:@[350px]:py-6"
export const GALLERY_CARD_AVATAR =
  "h-11 w-11 text-[15px] xl:@[290px]:h-14 xl:@[290px]:w-14 xl:@[290px]:text-lg xl:@[350px]:h-16 xl:@[350px]:w-16 xl:@[350px]:text-xl"

/**
 * Horizontal roster card: avatar, name, then "Year · Age · Gender". The grid
 * caps at four columns, so on wide screens the card scales its padding,
 * avatar and type with its own width (`@container`) instead of just stretching.
 */
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
      className={`@container block min-w-0 scroll-mt-32 rounded-xl border shadow-sm transition-[background-color,box-shadow] hover:bg-background-hover hover:shadow-md ${
        isYou ? "border-primary bg-primary/5" : "border-border bg-background"
      }`}
    >
      <div className={GALLERY_CARD_BODY}>
        <AthleteAvatar athlete={athlete} className={GALLERY_CARD_AVATAR} />
        <div className="flex min-w-0 flex-col xl:@[290px]:gap-0.5">
          <AthleteName
            athlete={athlete}
            className="text-[15px] leading-[22px] xl:@[290px]:text-[17px] xl:@[290px]:leading-6 xl:@[350px]:text-lg"
          />
          {meta && (
            <p className="truncate text-[13px] leading-[18px] tabular-nums text-foreground-secondary xl:@[290px]:text-sm xl:@[290px]:leading-5 xl:@[350px]:text-[15px]">
              {meta}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
