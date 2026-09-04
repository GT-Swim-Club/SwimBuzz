export default function DontReloadNotice({
  className = "",
  label = "Don't close the page — this may take a moment.",
}: {
  className?: string
  label?: string
}) {
  return (
    <p
      className={`flex items-center gap-2 text-xs text-foreground-secondary ${className}`}
      role="status"
    >
      <span
        className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground"
        aria-hidden="true"
      />
      <span>{label}</span>
    </p>
  )
}
