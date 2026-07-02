import { formatTime } from "@/lib/utils"
import {
  compareSwimPb,
  COURSE_LABELS,
  parseEventParts,
} from "@/lib/swim-parse"

type PbSwim = {
  event: string
  course: string
  timeMs: number
}

const STROKE_ACCENT: Record<string, string> = {
  Free: "border-l-sky-400 dark:border-l-sky-500",
  Back: "border-l-violet-400 dark:border-l-violet-500",
  Breast: "border-l-amber-400 dark:border-l-amber-500",
  Fly: "border-l-rose-400 dark:border-l-rose-500",
  IM: "border-l-emerald-400 dark:border-l-emerald-500",
}

const COURSE_HEADER_STYLES: Record<string, string> = {
  SCY: "text-slate-700 dark:text-zinc-200",
  SCM: "text-blue-700 dark:text-blue-300",
  LCM: "text-indigo-700 dark:text-indigo-300",
}

function groupByCourse(swims: PbSwim[]) {
  const sorted = [...swims].sort(compareSwimPb)
  const groups = new Map<string, PbSwim[]>()

  for (const swim of sorted) {
    const list = groups.get(swim.course) ?? []
    list.push(swim)
    groups.set(swim.course, list)
  }

  const ordered = COURSE_LABELS.filter((course) => groups.has(course)).map(
    (course) => ({ course, swims: groups.get(course)! })
  )

  for (const [course, courseSwims] of groups) {
    if (!COURSE_LABELS.includes(course as (typeof COURSE_LABELS)[number])) {
      ordered.push({ course, swims: courseSwims })
    }
  }

  return ordered
}

export default function PersonalBestsGrid({ swims }: { swims: PbSwim[] }) {
  if (swims.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-800 px-4 py-10 text-center">
        <p className="text-sm text-gray-400 dark:text-zinc-500">No times recorded yet.</p>
      </div>
    )
  }

  const groups = groupByCourse(swims)

  return (
    <div className="space-y-6">
      {groups.map(({ course, swims: courseSwims }) => (
        <section key={course}>
          <div className="flex items-center gap-3 mb-3">
            <h3
              className={`text-sm font-semibold uppercase tracking-wide ${
                COURSE_HEADER_STYLES[course] ?? "text-gray-900 dark:text-zinc-100"
              }`}
            >
              {course}
            </h3>
            <div className="h-px flex-1 bg-gray-100 dark:bg-zinc-800" />
            <span className="text-xs text-gray-400 dark:text-zinc-500 tabular-nums">
              {courseSwims.length}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {courseSwims.map((swim) => {
              const { stroke } = parseEventParts(swim.event)
              return (
                <div
                  key={`${swim.event}-${swim.course}`}
                  className={`rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 border-l-[3px] ${STROKE_ACCENT[stroke] ?? "border-l-gray-300"} px-3.5 py-3 shadow-sm hover:shadow-md hover:border-gray-200 dark:hover:border-zinc-700 transition-all`}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 leading-tight mb-2">
                    {swim.event}
                  </p>
                  <p className="text-xl font-semibold font-mono tabular-nums tracking-tight text-gray-900 dark:text-zinc-50">
                    {formatTime(swim.timeMs)}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
