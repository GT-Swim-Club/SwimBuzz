"use client"

import { useState } from "react"
import type { DeletedItem } from "@swimbuzz/api"
import { recoveryCountdown } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { RelativeDateRange } from "@/components/ui/RelativeDate"
import { Skeleton } from "@/components/ui/Skeleton"
import { useDeletedItems } from "@/lib/recovery/use-deleted-items"

const TONE_CLASS = {
  normal: "text-foreground-secondary",
  warning: "text-warning",
  expired: "text-error",
} as const

export default function DeletedMeetsList() {
  const { items, error, busy, restore, purge } = useDeletedItems("meet")
  const [confirmDelete, setConfirmDelete] = useState<DeletedItem | null>(null)

  if (items === null) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border-secondary p-8 text-center text-sm text-error">{error}</div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border-secondary p-10 text-center">
        <AppIcon name="trash" className="h-8 w-8 text-foreground-tertiary" />
        <p className="font-medium text-foreground">Trash is empty</p>
        <p className="text-sm text-foreground-secondary">Deleted meets show up here before they&apos;re permanently removed.</p>
      </div>
    )
  }

  return (
    <>
      <div className="divide-y divide-border rounded-xl border border-border-secondary">
        {items.map((item) => {
          const countdown = recoveryCountdown(item.purgeAfter)
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <AppIcon name="trophy" className="h-5 w-5 shrink-0 text-foreground-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{item.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-foreground-secondary">
                  <RelativeDateRange startsAt={item.startsAt} timeZone={item.timeZone} />
                  {item.deleteSwimsOnPurge && (
                    <span
                      className="group relative ml-1 inline-flex items-center rounded-full border border-border-secondary bg-fill px-2 py-0.5 text-[11px] font-medium text-foreground-secondary"
                      tabIndex={0}
                    >
                      Swims hidden
                      <HoverDetail label="This meet's swims are hidden from stats and will come back only if the meet is restored." />
                    </span>
                  )}
                </p>
              </div>
              <span className={`shrink-0 text-sm font-medium ${TONE_CLASS[countdown.tone]}`}>
                {countdown.label}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busy !== null || !item.canRestore}
                  onClick={() => void restore(item)}
                  aria-label={`Restore ${item.name}`}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
                >
                  {busy === item.id ? "Restoring…" : "Restore"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirmDelete(item)}
                  aria-label={`Delete ${item.name} permanently`}
                  className="group relative rounded-lg border border-border px-3 py-2.5 text-error hover:bg-fill disabled:opacity-50"
                >
                  <AppIcon name="trash" className="h-4 w-4" />
                  <HoverDetail label="Delete permanently" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        closeDisabled={!!busy}
        title={confirmDelete ? `Delete ${confirmDelete.name} permanently?` : ""}
        description={
          confirmDelete?.deleteSwimsOnPurge
            ? "This can't be undone. Its swims will be permanently deleted too."
            : "This can't be undone."
        }
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
              onClick={() => {
                if (!confirmDelete) return
                void purge(confirmDelete)
                setConfirmDelete(null)
              }}
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
