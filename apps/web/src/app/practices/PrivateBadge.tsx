export default function PrivateBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      title="Only you can see this practice"
      className={`shrink-0 rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold uppercase tracking-wide text-accent ${
        compact ? "px-1.5 py-px" : "px-2 py-0.5"
      }`}
    >
      Private
    </span>
  )
}
