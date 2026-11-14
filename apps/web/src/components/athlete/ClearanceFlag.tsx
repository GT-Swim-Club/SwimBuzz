import { clearanceFlagDetail, clearanceFlagLabel, type ClearanceCheck } from "@swimbuzz/shared"

export const clearanceFlagClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-warning-border bg-warning-bg px-2 py-px text-[11px] font-medium text-warning-text"

export function WarningGlyph({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

/**
 * Amber pill for an athlete missing a physical and/or concussion test ("No physical",
 * "No concussion test", "Not cleared"). Renders nothing when cleared. Staff-only surfaces.
 */
export default function ClearanceFlag({ missing }: { missing: ClearanceCheck[] | null | undefined }) {
  const label = clearanceFlagLabel(missing ?? [])
  if (!label) return null
  return (
    <span className={clearanceFlagClass} title={clearanceFlagDetail(missing ?? []) ?? undefined}>
      <WarningGlyph />
      {label}
    </span>
  )
}
