import type { EventOrder } from "@/lib/meet-event-order"
import { cleanEventName } from "@/lib/meet-event-order"

export default function EventOrderTable({ order }: { order: EventOrder }) {
  if (!order.sessions.length) return null

  return (
    <div className="space-y-6">
      {order.sessions.map((session, sessionIndex) => (
        <div key={`${session.label}-${sessionIndex}`}>
          <h3 className="text-center text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-2">
            {session.label}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b dark:border-zinc-700">
                  <th className="py-1.5 pr-3 text-left font-semibold text-gray-900 dark:text-zinc-100 w-16">
                    Women
                  </th>
                  <th className="py-1.5 px-3 text-center font-semibold text-gray-900 dark:text-zinc-100">
                    Event
                  </th>
                  <th className="py-1.5 pl-3 text-right font-semibold text-gray-900 dark:text-zinc-100 w-16">
                    Men
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.rows.map((row, i) => (
                  <tr
                    key={`${session.label}-${i}`}
                    className="border-b border-gray-100 dark:border-zinc-800 last:border-0"
                  >
                    <td className="py-1 pr-3 text-left tabular-nums text-gray-700 dark:text-zinc-300">
                      {row.women ?? ""}
                    </td>
                    <td className="py-1 px-3 text-center text-gray-800 dark:text-zinc-200">
                      {cleanEventName(row.event)}
                    </td>
                    <td className="py-1 pl-3 text-right tabular-nums text-gray-700 dark:text-zinc-300">
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
