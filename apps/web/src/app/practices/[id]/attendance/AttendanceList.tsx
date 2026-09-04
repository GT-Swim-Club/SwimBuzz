import Link from "next/link"
import ActionIcon from "@/components/ui/ActionIcon"
import InfoIcon from "@/components/ui/InfoIcon"
import StaffBadge from "@/components/ui/StaffBadge"
import { athletePath } from "@/lib/slug"
import { formatClockTime, type StaffTitle } from "@swimbuzz/shared"
import { ZonedInstantTime } from "@/components/ui/ZonedTime"
import { RelativeDateTime } from "@/components/ui/RelativeDate"

type AttendanceRecord = {
  id: string
  athleteId: string
  athleteSlug: string | null
  name: string
  gender: "M" | "F"
  year: string | null
  method: "SCAN" | "MANUAL"
  recordedAt: string
  staffTitle: StaffTitle | null
}

export default function AttendanceList({
  title,
  startsAt,
  endsAt,
  timeZone,
  location,
  attendance,
  viewerAthleteId,
}: {
  title: string
  startsAt: string
  endsAt: string
  timeZone: string
  location: string
  attendance: AttendanceRecord[]
  viewerAthleteId: string | null
}) {
  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Attendance
        </p>
        <div className="mt-2 text-sm text-foreground-secondary sm:text-base">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5">
              <InfoIcon kind="calendar" />
              <RelativeDateTime startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} />
            </span>
            {location && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1.5">
                  <InfoIcon kind="location" />
                  {location}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <h2 className="text-[15px] font-medium uppercase tracking-wide text-foreground-secondary">
          Checked in ({attendance.length})
        </h2>

        {attendance.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-foreground-secondary">
            No one has checked in yet.
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {attendance.map((record, index) => {
              const isYou = record.athleteId === viewerAthleteId
              return (
                <li
                  key={record.id}
                  className="attendance-row-in flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                  style={{ animationDelay: `${Math.min(index * 35, 420)}ms` }}
                >
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-foreground-tertiary">
                    {attendance.length - index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {record.athleteSlug ? (
                        <Link
                          href={athletePath(record.athleteSlug)}
                          className="truncate font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {record.name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium text-foreground">{record.name}</span>
                      )}
                      {isYou && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-text">
                          You
                        </span>
                      )}
                      {record.staffTitle && <StaffBadge title={record.staffTitle} />}
                    </div>
                    <p className="text-xs text-foreground-tertiary">
                      <ZonedInstantTime at={record.recordedAt}>
                        <span suppressHydrationWarning>{formatClockTime(new Date(record.recordedAt))}</span>
                      </ZonedInstantTime>
                      {record.year ? ` · ${record.year}` : ""}
                    </p>
                  </div>
                  {record.method === "SCAN" && (
                    <ActionIcon kind="scan" className="h-4 w-4 shrink-0 text-foreground-tertiary" />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
