import type { EventOrder } from "@/lib/meet-event-order"
import { cleanEventName } from "@/lib/meet-event-order"

function showSessionLabel(label: string): boolean {
  return label.trim().toLowerCase() !== "order of events"
}

export default function EventOrderTable({ order }: { order: EventOrder }) {
  if (!order.sessions.length) return null

  return (
    <div className="space-y-6">
      {order.sessions.map((session, sessionIndex) => (
        <div key={`${session.label}-${sessionIndex}`}>
          {showSessionLabel(session.label) ? (
            <h3 className="text-center text-sm font-semibold text-foreground mb-2">
              {session.label}
            </h3>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="py-1.5 pr-3 text-left font-semibold text-foreground dark:text-foreground w-16">
                    Women
                  </th>
                  <th className="py-1.5 px-3 text-center font-semibold text-foreground dark:text-foreground">
                    Event
                  </th>
                  <th className="py-1.5 pl-3 text-right font-semibold text-foreground dark:text-foreground w-16">
                    Men
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.rows.map((row, i) => (
                  <tr
                    key={`${session.label}-${i}`}
                  >
                    <td className="py-1 pr-3 text-left tabular-nums text-foreground-secondary dark:text-foreground-secondary">
                      {row.women ?? ""}
                    </td>
                    <td className="py-1 px-3 text-center text-foreground dark:text-foreground">
                      {cleanEventName(row.event)}
                    </td>
                    <td className="py-1 pl-3 text-right tabular-nums text-foreground-secondary dark:text-foreground-secondary">
                      {row.men ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
