"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import ActionIcon from "@/components/ui/ActionIcon"
import { downloadBlob } from "@/components/ui/export-menu"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { deletePractices, type DeletePracticesResult } from "./PracticeSelection.actions"
import { MONTH_SHORT_NAMES, type PracticeRailItem } from "./workspace-params"

/** The sidebar's select-mode state, passed down to the rails; null when not selecting. */
export type RailSelection = { selectedIds: ReadonlySet<string>; onToggle: (id: string) => void } | null

/** Per-card selection state while the sidebar is in select mode; null when it isn't. */
export type RailCardSelection = { checked: boolean; onToggle: () => void } | null

export function cardSelection(selection: RailSelection, id: string): RailCardSelection {
  if (!selection) return null
  return { checked: selection.selectedIds.has(id), onToggle: () => selection.onToggle(id) }
}

function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border transition-colors " +
        (checked ? "border-primary bg-primary" : "border-border-secondary bg-background")
      }
    >
      {checked && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 text-primary-contrast">
          <path d="m3.25 8.25 3 3 6.5-6.5" />
        </svg>
      )}
    </span>
  )
}

/**
 * A practice card in the sidebar rails: a link to the practice normally, or a checkbox toggle
 * (with the checked state taking over the card's highlight) while the sidebar is in select mode.
 */
export function SelectableRailCard({
  href,
  className,
  active,
  selection,
  children,
}: {
  href: string
  className: string
  active: boolean
  selection: RailCardSelection
  children: ReactNode
}) {
  const stateClass = (on: boolean) =>
    on ? "border-primary bg-primary/5" : "border-border-secondary hover:bg-background-hover"

  if (selection) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={selection.checked}
        onClick={selection.onToggle}
        className={className + " " + stateClass(selection.checked)}
      >
        <SelectCheckbox checked={selection.checked} />
        {children}
      </button>
    )
  }

  return (
    <Link href={href} className={className + " " + stateClass(active)}>
      {children}
    </Link>
  )
}

/** "Sep 13, 2026" from a practice's YYYY-MM-DD day key. */
function shortDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number)
  return `${MONTH_SHORT_NAMES[m - 1]} ${d}, ${y}`
}

function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/)
  return match?.[1] ?? "practices.pdf"
}

export function PracticeSelectionBar({
  selected,
  canDelete,
  allVisibleSelected,
  canSelectAll,
  onToggleAll,
  onCancel,
  onExported,
  onDeleted,
}: {
  /** Selected practices, oldest first. */
  selected: PracticeRailItem[]
  canDelete: boolean
  allVisibleSelected: boolean
  canSelectAll: boolean
  onToggleAll: () => void
  onCancel: () => void
  onExported: () => void
  /** Called after a bulk delete with what was actually moved to Trash. */
  onDeleted: (result: DeletePracticesResult) => void
}) {
  const [busy, setBusy] = useState<"pdf" | "delete" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const count = selected.length
  const privateCount = selected.filter((p) => p.isPrivate).length
  const allPrivate = count > 0 && privateCount === count
  const deleteLabel = allPrivate ? "Delete" : "Move to Trash"

  async function exportPdf() {
    setBusy("pdf")
    setError(null)
    try {
      const res = await fetch("/api/practices/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected.map((p) => p.id) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Could not export PDF")
      }
      downloadBlob(await res.blob(), filenameFromDisposition(res.headers.get("content-disposition")))
      onExported()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export PDF")
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    setBusy("delete")
    setError(null)
    try {
      const result = await deletePractices(selected.map((p) => p.id))
      setConfirmDelete(false)
      if (result.skipped.length > 0) {
        const n = result.skipped.length
        setError(
          `${n} practice${n === 1 ? " was" : "s were"} not deleted (being edited, or not yours to delete)`
        )
      }
      onDeleted(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-border-secondary bg-background p-2">
      <div className="flex items-center gap-2 pl-1">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {count === 0 ? "Select practices" : `${count} selected`}
        </p>
        {canSelectAll && (
          <button
            type="button"
            onClick={onToggleAll}
            className="shrink-0 text-xs text-foreground-secondary transition-colors hover:text-primary"
          >
            {allVisibleSelected ? "Deselect all" : "Select all"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy != null}
          className="ml-auto shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      <div className="flex items-center gap-2">
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setConfirmDelete(true)
            }}
            disabled={count === 0 || busy != null}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-error-border bg-background text-[13px] font-medium text-error transition-colors hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ActionIcon kind="delete" className="h-4 w-4" />
            {deleteLabel}
          </button>
        )}
        <button
          type="button"
          onClick={exportPdf}
          disabled={count === 0 || busy != null}
          className="h-9 flex-1 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-contrast transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "pdf" ? "Exporting…" : "Export PDF"}
        </button>
      </div>
      {error && !confirmDelete && <p className="px-1 text-xs text-error">{error}</p>}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={busy === "delete"}
        title={deleteLabel}
        description={
          allPrivate ? (
            <>
              Permanently delete{" "}
              <span className="font-medium text-foreground">
                {count} private practice{count === 1 ? "" : "s"}
              </span>
              ? This can&apos;t be undone.
            </>
          ) : (
            <>
              Move{" "}
              <span className="font-medium text-foreground">
                {count} practice{count === 1 ? "" : "s"}
              </span>{" "}
              to Trash.
              {privateCount > 0 && " Private practices skip Trash and are deleted permanently."}
            </>
          )
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy === "delete"}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy === "delete"}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-red-700 disabled:opacity-50"
            >
              {busy === "delete" ? (allPrivate ? "Deleting…" : "Moving…") : deleteLabel}
            </button>
          </ModalFooter>
        }
      >
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
          {selected.map((practice) => (
            <li key={practice.id} className="flex items-baseline gap-2">
              <span className="w-28 shrink-0 whitespace-nowrap tabular-nums text-foreground-tertiary">
                {shortDayLabel(practice.dayKey)}
              </span>
              <span className="min-w-0 truncate text-foreground">{practice.title}</span>
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-sm text-error">{error}</p>}
      </Modal>
    </div>
  )
}
