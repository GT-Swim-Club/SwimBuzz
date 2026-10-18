"use client"

import { useState } from "react"
import type { DeletedItem } from "@swimbuzz/api"
import { formatMeetDateRange, recoveryCountdown } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { RelativeDateRange } from "@/components/ui/RelativeDate"
import { Skeleton } from "@/components/ui/Skeleton"
import { useDeletedItems } from "@/lib/recovery/use-deleted-items"
import MeetGalleryCard, { MeetCardRows } from "./MeetGalleryCard"
import MeetListTable from "./MeetListTable"
import { MeetListSkeleton } from "./MeetsListSkeleton"
import { useListLayout } from "@/components/ui/ListLayout"

const TONE_CLASS = {
  normal: "text-white",
  warning: "text-warning",
  expired: "text-error",
} as const

/** Same tones on a list row's plain background, where white text would vanish. */
const ROW_TONE_CLASS = {
  normal: "text-foreground-secondary",
  warning: "text-warning",
  expired: "text-error",
} as const

export default function DeletedMeetsList({ query }: { query: string }) {
  const { items, error, busy, restore, purge } = useDeletedItems("meet")
  const [confirmDelete, setConfirmDelete] = useState<DeletedItem | null>(null)
  const { layout } = useListLayout()

  if (items === null) {
    if (layout === "list") return <MeetListSkeleton heading="w-16" rows={3} actions="trash" />
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
        {layout === "list" ? (
          <MeetListTable
            actions="trash"
            rows={shown.map((item) => {
              const countdown = recoveryCountdown(item.purgeAfter)
              return {
                id: item.id,
                name: item.name,
                iconUrl: item.iconUrl ?? null,
                bannerUrl: item.bannerUrl ?? null,
                date: formatMeetDateRange(item.startsAt, item.endsAt, item.timeZone),
                location: [item.location, item.school].filter(Boolean).join(" · "),
                status: <span className={`tabular-nums ${ROW_TONE_CLASS[countdown.tone]}`}>{countdown.label}</span>,
                actions: (
                  <>
                    <button
                      type="button"
                      disabled={busy !== null || !item.canRestore}
                      onClick={() => void restore(item)}
                      aria-label={`Restore ${item.name}`}
                      className="flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-contrast transition-colors hover:bg-primary-hover disabled:opacity-50 max-sm:w-8 max-sm:px-0"
                    >
                      {/* Icon-only on phones, where the label would squeeze the meet column. */}
                      <AppIcon name="rotateCcw" className="h-4 w-4 sm:hidden" />
                      <span className="max-sm:hidden">{busy === item.id ? "Restoring…" : "Restore"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirmDelete(item)}
                      aria-label={`Delete ${item.name} permanently`}
                      className="group relative flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-error disabled:opacity-50"
                    >
                      <AppIcon name="trash" className="h-4 w-4" />
                      <HoverDetail label="Delete permanently" />
                    </button>
                  </>
                ),
              }
            })}
          />
        ) : (
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
                  <span
                    className={`inline-flex items-center rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium tabular-nums ring-1 ring-inset ring-white/15 backdrop-blur-md ${TONE_CLASS[countdown.tone]}`}
                  >
                    {countdown.label}
                  </span>
                }
                actions={
                  <>
                    <button
                      type="button"
                      disabled={busy !== null || !item.canRestore}
                      onClick={() => void restore(item)}
                      aria-label={`Restore ${item.name}`}
                      className="h-[2.57em] whitespace-nowrap rounded-[0.57em] bg-primary px-[1.14em] text-[1em] font-medium text-primary-contrast transition-colors [text-shadow:none] hover:bg-primary-hover disabled:opacity-50"
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
        )}
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
