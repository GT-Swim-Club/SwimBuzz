"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createApiClient } from "@swimbuzz/api"
import { formatPracticeDistance, recoveryCountdown } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { practicePath } from "@/lib/slug"
import { buildWorkspaceHref, MONTH_SHORT_NAMES, type DeletedPracticeRailItem } from "./workspace-params"
import { sortPractices } from "./PracticeListRail"
import type { PracticeListSort } from "./usePracticePrefs"

const api = createApiClient({})

const TONE_CLASS = {
  normal: "text-foreground-secondary",
  warning: "text-warning",
  expired: "text-error",
} as const

function dayParts(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return {
    dateNumber: date.getUTCDate(),
    month: MONTH_SHORT_NAMES[date.getUTCMonth()],
  }
}

export default function DeletedPracticeListRail({
  practices,
  selectedSlug,
  tags,
  sort,
  emptyMessage,
}: {
  practices: DeletedPracticeRailItem[]
  selectedSlug?: string
  tags: string[]
  sort: PracticeListSort
  emptyMessage: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<DeletedPracticeRailItem | null>(null)
  const sorted = sortPractices(practices, sort)

  async function restore(item: DeletedPracticeRailItem) {
    setBusy(item.id)
    setError("")
    try {
      await api.restoreDeleted("practice", item.id)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  async function purge(item: DeletedPracticeRailItem) {
    setBusy(item.id)
    setError("")
    try {
      await api.purgeDeleted("practice", item.id)
      setConfirmDelete(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border-secondary bg-background px-3 py-8 text-center text-[13px] text-foreground-secondary">
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl border border-border-secondary bg-background p-2">
        {error && <p className="px-1 text-xs text-error">{error}</p>}
        {sorted.map((practice) => {
          const { dateNumber, month } = dayParts(practice.dayKey)
          const countdown = recoveryCountdown(practice.purgeAfter)
          const selected = Boolean(selectedSlug) && (practice.slug ?? practice.id) === selectedSlug
          return (
            <Link
              key={practice.id}
              href={buildWorkspaceHref(practicePath(practice.slug ?? practice.id), { tags })}
              className={
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors " +
                (selected ? "border-primary bg-primary/5" : "border-border-secondary hover:bg-fill-secondary")
              }
            >
              <div className="w-10 shrink-0 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
                  {month}
                </div>
                <div className="text-base font-semibold tabular-nums text-foreground">{dateNumber}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="min-w-0 truncate text-sm font-medium leading-tight text-foreground">{practice.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {practice.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/80 px-1.5 py-px text-[10px] text-primary-text dark:bg-primary"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className={`text-[11px] font-medium ${TONE_CLASS[countdown.tone]}`}>
                    {countdown.label}
                  </span>
                </div>
              </div>
              {practice.totalDistance > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-foreground-tertiary">
                  {formatPracticeDistance(practice.totalDistance, practice.course)}
                </span>
              )}
              <button
                type="button"
                disabled={busy !== null || !practice.canRestore}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void restore(practice)
                }}
                aria-label={`Restore ${practice.title}`}
                className="group relative shrink-0 rounded-md p-1.5 hover:bg-fill-secondary disabled:opacity-50"
              >
                <ActionIcon kind="restore" className="h-4 w-4" />
                <HoverDetail label={busy === practice.id ? "Restoring…" : "Restore"} />
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setConfirmDelete(practice)
                }}
                aria-label={`Delete ${practice.title} permanently`}
                className="group relative shrink-0 rounded-md p-1.5 text-error hover:bg-fill-secondary disabled:opacity-50"
              >
                <AppIcon name="trash" className="h-4 w-4" />
                <HoverDetail label="Delete permanently" />
              </button>
            </Link>
          )
        })}
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        closeDisabled={!!busy}
        title={confirmDelete ? `Delete ${confirmDelete.title} permanently?` : ""}
        description="This can't be undone."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={!!busy}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => confirmDelete && void purge(confirmDelete)}
              disabled={!!busy}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
            >
              Delete permanently
            </button>
          </ModalFooter>
        }
      />
    </>
  )
}
