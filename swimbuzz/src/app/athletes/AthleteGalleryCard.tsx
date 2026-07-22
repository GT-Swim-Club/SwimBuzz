import Link from "next/link"

export default function AthleteGalleryCard({
  athlete,
  showGender,
  isYou,
}: {
  athlete: {
    id: string
    firstName: string
    lastName: string
    user: { image: string | null; email: string | null } | null
    nicknames: string[]
    gender: string
    swimCloudId: number | null
  }
  showGender: boolean
  isYou?: boolean
}) {
  return (
    <Link
      href={`/athletes/${athlete.id}`}
      className={`group block rounded-xl overflow-hidden border p-4 flex flex-col items-center text-center h-full transition-all ${isYou ? "border-primary bg-primary/5 shadow-sm hover:shadow-md" : "border-border bg-background shadow-sm hover:shadow-md hover:border-border hover:bg-fill-secondary"}`}
    >
      <div className="h-20 w-20 rounded-full overflow-hidden border border-primary/30 bg-primary/20 mb-4">
        {athlete.user?.image ? (
          <img
            src={athlete.user.image}
            alt={`${athlete.firstName} ${athlete.lastName}`}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl font-semibold text-primary">
            {athlete.firstName[0]}
            {athlete.lastName[0]}
          </div>
        )}
      </div>
      <h3 className="font-medium text-sm text-foreground">
        {athlete.firstName}
        {athlete.nicknames.length > 0 && (
          <span className="font-normal text-foreground-secondary">
            {" "}
            ({athlete.nicknames.join(", ")})
          </span>
        )}
        {" "}
        {athlete.lastName}
      </h3>
      <div className="text-xs text-foreground-secondary mt-0.5 space-y-0.5 w-full">
        {athlete.user?.email && <p className="truncate">{athlete.user.email}</p>}
        {athlete.swimCloudId && <p className="truncate">SwimCloud: {athlete.swimCloudId}</p>}
        {showGender && (
          <p className="font-medium uppercase tracking-wide text-foreground-tertiary">
            {athlete.gender === "F" ? "Women" : "Men"}
          </p>
        )}
      </div>
    </Link>
  )
}
