"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { downloadBlob } from "@/components/ui/export-menu"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import type { DeletePracticesResult } from "@/lib/practice/practice-bulk-delete"
import { deletePractices } from "./PracticeSelection.actions"
import { MONTH_SHORT_NAMES, type PracticeRailItem } from "./workspace-params"

/** The sidebar's selection state, passed down to the rails. */
export type RailSelection = {
  /** Select mode is on: clicking anywhere on a card toggles it instead of opening it. */
  selecting: boolean
  selectedIds: ReadonlySet<string>
  /** Toggles a practice; outside select mode it starts select mode with that practice. */
  onToggle: (id: string) => void
}

/** One card's slice of the selection state. */
export type RailCardSelection = { selecting: boolean; checked: boolean; onToggle: () => void }

export function cardSelection(selection: RailSelection, id: string): RailCardSelection {
  return {
    selecting: selection.selecting,
    checked: selection.selectedIds.has(id),
    onToggle: () => selection.onToggle(id),
  }
}

function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border transition-colors " +
        (checked ? "border-primary bg-primary" : "border-foreground-tertiary/50 bg-background group-hover/check:border-primary")
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

const LONG_PRESS_MS = 500
// A finger drifting further than this (px) is scrolling, not long-pressing.
const LONG_PRESS_SLOP = 10

/**
 * Long-press on touch (where there's no hover checkbox): calls onLongPress after LONG_PRESS_MS,
 * and swallows the click that follows so the card's link doesn't also open.
 */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }
  useEffect(() => cancel, [])

  return {
    onPointerDown(e: PointerEvent) {
      fired.current = false
      if (e.pointerType !== "touch") return
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => {
        fired.current = true
        cancel()
        navigator.vibrate?.(10)
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onPointerMove(e: PointerEvent) {
      if (!start.current) return
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > LONG_PRESS_SLOP) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClick(e: MouseEvent) {
      if (fired.current) {
        e.preventDefault()
        fired.current = false
      }
    },
    // Keep the browser's link-preview / context menu from opening on the same long press.
    onContextMenu(e: MouseEvent) {
      if (timer.current || fired.current) e.preventDefault()
    },
  }
}

/**
 * A practice card in the sidebar rails. Normally a link to the practice; hovering the card's
 * right-hand column (badges, distance) swaps it for a checkbox — ticking it starts select mode.
 * In select mode the whole card toggles its practice, the checkbox stays in that spot on every
 * card, and the checked state takes over the card's highlight. On touch screens a long press does
 * what the checkbox does.
 */
export function SelectableRailCard({
  href,
  className,
  wrapperClassName = "",
  active,
  selection,
  trailing,
  children,
}: {
  href: string
  className: string
  /** Layout classes for the outer wrapper (e.g. flex-1 to fill a week-rail day). */
  wrapperClassName?: string
  active: boolean
  selection: RailCardSelection
  /** The card's right-hand column, hidden while the checkbox shows in its place. */
  trailing: ReactNode
  children: ReactNode
}) {
  const { selecting, checked, onToggle } = selection
  const longPress = useLongPress(onToggle)
  const highlighted = selecting ? checked : active
  const cardClass =
    className +
    " w-full " +
    (highlighted ? "border-primary bg-primary/5" : "border-border-secondary group-hover:bg-background-hover")

  // min-w-5 keeps room for the checkbox on cards with nothing on the right. Outside select mode
  // the column fades (rather than going invisible) so it keeps receiving the hover that shows the
  // checkbox over it.
  const content = (
    <>
      {children}
      <div
        data-rail-trailing
        className={
          "flex min-w-5 shrink-0 flex-col items-end gap-1 self-stretch justify-center " +
          (selecting
            ? "invisible"
            : "group-has-[[data-rail-trailing]:hover]:opacity-0 group-has-[[data-rail-check]:hover]:opacity-0 group-has-[[data-rail-check]:focus-visible]:opacity-0")
        }
      >
        {trailing}
      </div>
    </>
  )
  // Over the right-hand column: a 32px hit target centered on the box, which lines up with the
  // card's px-3 padding.
  const checkboxSlot = "absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center"

  if (selecting) {
    return (
      <div className={"group relative flex " + wrapperClassName}>
        <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className={cardClass}>
          {content}
        </button>
        <span className={"pointer-events-none " + checkboxSlot}>
          <SelectCheckbox checked={checked} />
        </span>
      </div>
    )
  }

  return (
    <div className={"group relative flex " + wrapperClassName}>
      <Link
        href={href}
        {...longPress}
        className={cardClass + " select-none [-webkit-touch-callout:none]"}
      >
        {content}
      </Link>
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label="Select practice"
        data-rail-check
        onClick={onToggle}
        className={
          "group/check rounded-md opacity-0 outline-none hover:opacity-100 focus-visible:opacity-100 group-has-[[data-rail-trailing]:hover]:opacity-100 " +
          checkboxSlot
        }
      >
        <SelectCheckbox checked={false} />
      </button>
    </div>
  )
}

const barButtonClass =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50"

function SelectAllIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5" />
      <path d="m9 11 3 3L22 4" />
    </svg>
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
  canSelectAll,
  onSelectAll,
  onCancel,
  onExported,
  onDeleted,
}: {
  /** Selected practices, oldest first. */
  selected: PracticeRailItem[]
  canDelete: boolean
  /** Some of the practices on screen aren't selected yet (Cancel covers clearing). */
  canSelectAll: boolean
  onSelectAll: () => void
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
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate pl-1 text-sm font-medium text-foreground">
          {count === 0 ? "Select practices" : `${count} selected`}
        </p>
        {canSelectAll && (
          <button
            type="button"
            onClick={onSelectAll}
            aria-label="Select all"
            className={barButtonClass + " border-border-secondary text-foreground hover:bg-fill-secondary"}
          >
            <SelectAllIcon />
            <HoverDetail label="Select all" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setConfirmDelete(true)
            }}
            disabled={count === 0 || busy != null}
            aria-label={deleteLabel}
            className={barButtonClass + " border-error-border text-error hover:bg-error-bg"}
          >
            <ActionIcon kind="delete" className="h-4 w-4" />
            <HoverDetail label={deleteLabel} />
          </button>
        )}
        <button
          type="button"
          onClick={exportPdf}
          disabled={count === 0 || busy != null}
          aria-label={busy === "pdf" ? "Exporting PDF" : "Export PDF"}
          aria-busy={busy === "pdf"}
          className={
            barButtonClass +
            " border-transparent bg-primary text-primary-contrast hover:bg-primary-hover" +
            (busy === "pdf" ? " animate-pulse" : "")
          }
        >
          <ActionIcon kind="share" className="h-4 w-4" />
          <HoverDetail label={busy === "pdf" ? "Exporting PDF…" : "Export PDF"} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy != null}
          aria-label="Cancel"
          className={barButtonClass + " border-border-secondary text-foreground-secondary hover:bg-fill-secondary hover:text-foreground"}
        >
          <ActionIcon kind="close" className="h-4 w-4" />
          <HoverDetail label="Cancel" />
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
              className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-error-hover disabled:opacity-50"
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
