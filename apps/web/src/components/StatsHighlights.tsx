import Link from "next/link"
import type { StatCounter, StatSpotlight } from "@/lib/meet-stats"

function SpotlightLine({ spotlight }: { spotlight: StatSpotlight }) {
  const { text, href, linkLabel } = spotlight
  if (href && linkLabel && text.includes(linkLabel)) {
    const idx = text.indexOf(linkLabel)
    const before = text.slice(0, idx)
    const after = text.slice(idx + linkLabel.length)
    return (
      <p className="mt-3 text-sm text-foreground-secondary">
        {before}
        <Link
          href={href}
          className="font-medium text-foreground transition-colors hover:text-primary"
        >
          {linkLabel}
        </Link>
        {after}
      </p>
    )
  }
  if (href) {
    return (
      <p className="mt-3 text-sm text-foreground-secondary">
        <Link
          href={href}
          className="font-medium text-foreground transition-colors hover:text-primary"
        >
          {text}
        </Link>
      </p>
    )
  }
  return <p className="mt-3 text-sm text-foreground-secondary">{text}</p>
}

export default function StatsHighlights({
  title,
  counters,
  spotlight,
}: {
  title: string
  counters: StatCounter[]
  spotlight?: StatSpotlight | null
}) {
  if (counters.length === 0) return null

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-foreground-secondary">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {counters.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-fill-secondary px-3 py-2.5"
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
              {c.label}
            </div>
            <div className="mt-0.5 truncate font-medium tabular-nums text-foreground">
              {c.value}
            </div>
            {c.hint ? (
              <div className="mt-0.5 truncate text-xs text-foreground-tertiary">
                {c.hint}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {spotlight?.text ? <SpotlightLine spotlight={spotlight} /> : null}
    </section>
  )
}
