import HoverDetail from "@/components/ui/HoverDetail"

/**
 * A gold mark before a time (the unofficial or manually added "*"); hovering it shows `label`.
 * Renders nothing when `show` is false, so it can sit before every time. It hangs off the time's
 * left edge (zero layout width), so the times stay lined up, and sits above a row's stretched link.
 */
export default function TimeMark({
  show,
  mark,
  label,
  className = "",
}: {
  show?: boolean | null
  mark: string
  label: string
  className?: string
}) {
  if (!show) return null
  return (
    <span className={`group relative z-[1] -ml-2 inline-block w-2 pr-px text-right text-accent ${className}`}>
      <span aria-hidden>{mark}</span>
      <span className="sr-only">{`(${label}) `}</span>
      <HoverDetail label={label} textClassName="text-accent" />
    </span>
  )
}
