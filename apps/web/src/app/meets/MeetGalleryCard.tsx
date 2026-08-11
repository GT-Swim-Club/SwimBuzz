import Link from "next/link"
import { formatDateRange } from "@/lib/utils"
import EditMeetButton from "./EditMeetButton"
import { type MeetFormState } from "./MeetFields"
import { meetPath } from "@/lib/slug"
import MeetCountdown from "@/components/MeetCountdown"

export default function MeetGalleryCard({
  meet,
  upcoming,
  isCoach,
  initial,
  seasons,
}: {
  meet: {
    id: string
    slug: string | null
    name: string
    location: string | null
    startDate: Date
    startTime: string | null
    endDate: Date | null
    school: string | null
    iconUrl: string | null
    bannerUrl: string | null
  }
  upcoming: boolean
  isCoach: boolean
  initial: MeetFormState
  seasons: string[]
}) {
  return (
    <Link
      href={meetPath(meet.slug ?? meet.id)}
      className="group block rounded-xl overflow-hidden border border-border border-border-secondary-secondary bg-background dark:bg-fill-secondary shadow-sm hover:shadow-md transition-shadow dark:border-border-secondary-secondary"
    >
      <div className="aspect-[2/1] bg-gray-100 dark:bg-fill relative">
        {meet.bannerUrl ? (
          <img
            src={meet.bannerUrl}
            alt={meet.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-foreground-tertiary dark:text-foreground-tertiary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15.5 16.5 11l-5 5-2-2-4 4" />
            </svg>
          </div>
        )}
        {upcoming && (
          <span className="absolute top-2 right-2">
            <MeetCountdown
              startDate={meet.startDate}
              startTime={meet.startTime}
              upcoming
              className="backdrop-blur-sm"
            />
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {meet.iconUrl && (
                <img
                  src={meet.iconUrl}
                  alt={meet.name}
                  className="h-5 w-5 rounded object-cover shrink-0"
                />
              )}
              <h3 className="font-medium text-sm text-foreground text-foreground">
                {meet.name}
              </h3>
            </div>
            <p className="text-xs text-foreground-secondary dark:text-foreground-secondary mt-1">
              {formatDateRange(meet.startDate, meet.endDate)}
            </p>
          </div>
          {isCoach && (
            <div onClick={(e) => e.preventDefault()}>
              <EditMeetButton meetId={meet.id} initial={initial} seasons={seasons} />
            </div>
          )}
        </div>
        <p className="text-xs text-foreground-tertiary dark:text-foreground-tertiary mt-2">
          {[meet.location, meet.school].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  )
}
