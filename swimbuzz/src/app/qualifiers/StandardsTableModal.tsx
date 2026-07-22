"use client"

import { useState } from "react"
import Modal, { ModalFooter } from "@/components/Modal"
import type { StandardsTableRow } from "@/lib/nationals-qualifiers"

function cellClass(value: string) {
  if (value.startsWith("QUAL")) {
    return "text-[11px] leading-tight text-foreground-secondary dark:text-foreground-secondary"
  }
  if (value === "--") {
    return "text-foreground-tertiary dark:text-foreground-tertiary"
  }
  return "tabular-nums text-foreground dark:text-foreground"
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
        className="text-primary hover:underline dark:text-primary"
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
              className="text-primary hover:underline dark:text-primary"
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
              className="w-full rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:border border-border-secondary dark:hover:bg-fill-secondary"
            >
              Close
            </button>
          </ModalFooter>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-foreground-tertiary dark:text-foreground-tertiary">
                <th className="py-1 pr-4 text-right w-[32%]">Women</th>
                <th className="py-1 px-3 text-center">Event</th>
                <th className="py-1 pl-4 text-left w-[32%]">Men</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.event}
                >
                  <td className={`py-0.5 pr-4 text-right ${cellClass(row.women)}`}>
                    {row.women}
                  </td>
                  <td className="py-0.5 px-3 text-center font-medium text-foreground dark:text-foreground">
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
            <p className="py-6 text-center text-sm text-foreground-secondary dark:text-foreground-secondary">
              No standards loaded.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
