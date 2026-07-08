export default function DontReloadNotice({
  className = "",
  label = "Don't close the page — this may take a moment.",
}: {
  className?: string
  label?: string
}) {
  return (
    <p
      className={`flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 ${className}`}
      role="status"
    >
      <span
        className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-zinc-600 dark:border-t-zinc-300"
        aria-hidden="true"
      />
      <span>{label}</span>
    </p>
  )
}
