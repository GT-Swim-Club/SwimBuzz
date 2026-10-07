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
import MeetGalleryCard, { MeetCardRows } from "./MeetGalleryCard"

const TONE_CLASS = {
  normal: "text-white",
  warning: "text-warning",
  expired: "text-error",
} as const

export default function DeletedMeetsList({ query }: { query: string }) {
  const { items, error, busy, restore, purge } = useDeletedItems("meet")
  const [confirmDelete, setConfirmDelete] = useState<DeletedItem | null>(null)

  if (items === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="aspect-[32/9] w-full rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border-secondary p-8 text-center text-sm text-error">{error}</div>
    )
  }

  const q = query.trim().toLowerCase()
  const shown = q
    ? items.filter((item) => [item.name, item.location, item.school].some((v) => v?.toLowerCase().includes(q)))
    : items

  if (shown.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background px-4 py-12 text-center">
        {q ? (
          <p className="text-sm text-foreground-secondary">No deleted meets match your search.</p>
        ) : (
          <>
            <AppIcon name="trash" className="h-8 w-8 text-foreground-tertiary" />
            <p className="font-medium text-foreground">Trash is empty</p>
            <p className="text-sm text-foreground-secondary">Deleted meets show up here before they&apos;re permanently removed.</p>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-foreground-secondary">Trash</h2>
        <MeetCardRows
          items={shown}
          renderCard={(item, rowSize) => {
            const countdown = recoveryCountdown(item.purgeAfter)
            return (
              <MeetGalleryCard
                name={item.name}
                bannerUrl={item.bannerUrl ?? null}
                iconUrl={item.iconUrl}
                dateLine={<RelativeDateRange startsAt={item.startsAt} endsAt={item.endsAt} timeZone={item.timeZone} />}
                location={[item.location, item.school].filter(Boolean).join(" · ")}
                stackMeta={rowSize >= 3}
                badge={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium tabular-nums ring-1 ring-inset ring-white/15 backdrop-blur-md ${TONE_CLASS[countdown.tone]}`}
                    >
                      {countdown.label}
                    </span>
                    {item.deleteSwimsOnPurge && (
                      <span
                        className="relative inline-flex items-center rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white/85 ring-1 ring-inset ring-white/15 backdrop-blur-md"
                        tabIndex={0}
                      >
                        Swims hidden
                        <HoverDetail label="This meet's swims are hidden from stats and will come back only if the meet is restored." />
                      </span>
                    )}
                  </div>
                }
                actions={
                  <>
                    <button
                      type="button"
                      disabled={busy !== null || !item.canRestore}
                      onClick={() => void restore(item)}
                      aria-label={`Restore ${item.name}`}
                      className="h-[2.57em] whitespace-nowrap rounded-[0.57em] bg-primary px-[1.14em] text-[1em] font-medium text-primary-text transition-colors [text-shadow:none] hover:bg-primary-hover disabled:opacity-50"
                    >
                      {busy === item.id ? "Restoring…" : "Restore"}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirmDelete(item)}
                      aria-label={`Delete ${item.name} permanently`}
                      className="relative flex h-[2.57em] w-[2.57em] items-center justify-center rounded-[0.57em] border border-white/30 text-white/85 transition-colors hover:bg-white/12 hover:text-error disabled:opacity-50"
                    >
                      <AppIcon name="trash" className="h-[1.15em] w-[1.15em]" />
                      <HoverDetail label="Delete permanently" />
                    </button>
                  </>
                }
              />
            )
          }}
        />
      </section>

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
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-red-700 disabled:opacity-50"
            >
              Delete permanently
            </button>
          </ModalFooter>
        }
      />
    </>
  )
}
