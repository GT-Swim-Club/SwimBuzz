/**
 * Loading state for slow, algorithm-backed work (building optimal relays, every event's top 10):
 * a centered spinner with a short label. Quick fetches use detailed skeletons instead.
 */
export default function SpinnerScreen({
  label,
  className = "min-h-64",
}: {
  /** Shown under the spinner and announced to screen readers, e.g. "Building optimal relays…". */
  label: string
  /** Sizing/frame for the area the spinner fills — roughly the size of what it stands in for. */
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 px-4 py-8 text-center ${className}`}
    >
      {/* Fades in on mount; give the SpinnerScreen a key per thing loading to replay it on a switch. */}
      <div className="spinner-screen-in flex flex-col items-center gap-3">
        <span
          aria-hidden
          className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
        />
        <p className="text-sm text-foreground-secondary">{label}</p>
      </div>
    </div>
  )
}
