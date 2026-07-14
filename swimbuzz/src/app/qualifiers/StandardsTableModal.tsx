"use client"

import { useState } from "react"
import Modal, { ModalFooter } from "@/components/Modal"
import type { StandardsTableRow } from "@/lib/nationals-qualifiers"

function cellClass(value: string) {
  if (value.startsWith("QUAL")) {
    return "text-[11px] leading-tight text-gray-600 dark:text-zinc-400"
  }
  if (value === "--") {
    return "text-gray-400 dark:text-zinc-500"
  }
  return "tabular-nums text-gray-900 dark:text-zinc-100"
}

export default function StandardsTableModal({
  yearLabel,
  course,
  sourceUrl,
  rows,
}: {
  yearLabel: string | null
  course: string
  sourceUrl: string | null
  rows: StandardsTableRow[]
}) {
  const [open, setOpen] = useState(false)
  const title = `Nationals${yearLabel ? ` ${yearLabel}` : ""} · ${course}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-indigo-600 hover:underline dark:text-indigo-400"
      >
        View standards
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={
          sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Open source PDF
            </a>
          ) : (
            "Qualifying times"
          )
        }
        maxWidth="xl"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </ModalFooter>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="py-1 pr-4 text-right w-[32%]">Women</th>
                <th className="py-1 px-3 text-center">Event</th>
                <th className="py-1 pl-4 text-left w-[32%]">Men</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.event}
                  className="border-b border-gray-100 dark:border-zinc-800"
                >
                  <td className={`py-0.5 pr-4 text-right ${cellClass(row.women)}`}>
                    {row.women}
                  </td>
                  <td className="py-0.5 px-3 text-center font-medium text-gray-900 dark:text-zinc-100">
                    {row.event}
                  </td>
                  <td className={`py-0.5 pl-4 text-left ${cellClass(row.men)}`}>
                    {row.men}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-zinc-400">
              No standards loaded.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
