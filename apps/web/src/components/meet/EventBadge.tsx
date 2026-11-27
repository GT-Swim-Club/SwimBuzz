/**
 * An event's number in a gold circle. Without `compact`: 21px with a 10px semibold number, as on the
 * relays page and its PNG. The roster summary passes `compact` to size it to its row density instead.
 */
export function EventBadge({ number, compact }: { number: number; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/10 tabular-nums text-accent ${
        compact === undefined
          ? "h-[21px] min-w-[21px] px-[3px] text-[10px] font-semibold"
          : compact
            ? "h-5 w-5 text-[10px] font-semibold"
            : "h-[26px] w-[26px] text-[11px] font-semibold"
      }`}
    >
      {number}
    </span>
  )
}
