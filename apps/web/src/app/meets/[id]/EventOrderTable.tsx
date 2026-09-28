import type { EventOrder } from "@/lib/meet/meet-event-order"
import { cleanEventName } from "@/lib/meet/meet-event-order"

function showSessionLabel(label: string): boolean {
  return label.trim().toLowerCase() !== "order of events"
}

// Sessions sit side by side on wider screens so the whole order fits without scrolling.
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
}
const GRID_COLS_MANY = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"

export function eventOrderColumns(order: EventOrder): 1 | 2 | 3 | 4 {
  return Math.max(1, Math.min(order.sessions.length, 4)) as 1 | 2 | 3 | 4
}

export default function EventOrderTable({ order }: { order: EventOrder }) {
  if (!order.sessions.length) return null

  return (
    <div className={`grid gap-3 ${GRID_COLS[order.sessions.length] ?? GRID_COLS_MANY}`}>
      {order.sessions.map((session, sessionIndex) => (
        <section
          key={`${session.label}-${sessionIndex}`}
          className="overflow-hidden rounded-xl border border-border"
        >
          {showSessionLabel(session.label) ? (
            <h3 className="border-b border-border bg-fill px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
              {session.label}
            </h3>
          ) : null}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-foreground-tertiary">
                <th className="w-14 py-1.5 pl-3 text-left font-medium">Women</th>
                <th className="px-2 py-1.5 text-center font-medium">Event</th>
                <th className="w-14 py-1.5 pr-3 text-right font-medium">Men</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {session.rows.map((row, i) => (
                <tr key={`${session.label}-${i}`}>
                  <td className="py-1.5 pl-3 text-left font-medium tabular-nums text-foreground-secondary">
                    {row.women ?? ""}
                  </td>
                  <td className="px-2 py-1.5 text-center text-foreground">
                    {cleanEventName(row.event)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium tabular-nums text-foreground-secondary">
                    {row.men ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
