"use client"

import type { ReactNode } from "react"
import { useEffect, useState, useTransition } from "react"
import TravelInfoIcon, { type TravelInfoKind } from "@/components/ui/TravelInfoIcon"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import {
  ResourceFileOrLink,
  ResourceList,
  ResourceModalHeader,
  ResourceRow,
  resourceValueLabel,
} from "@/components/meet/ResourceRows"
import { useMeetResourceUploads } from "@/lib/meet/use-meet-resource-uploads"
import { useUnsavedUploads } from "@/lib/meet/unsaved-uploads"
import RichTextField from "@/components/ui/RichTextField"
import { updateMeet } from "./meet-update.actions"

export type TravelInfoForm = {
  rideSignUpsUrl: string
  roomsUrl: string
  hotel: string
  packingList: string
  itinerary: string
}

type TravelKey = keyof TravelInfoForm

const TRAVEL_ROWS: { key: TravelKey; label: string; icon: TravelInfoKind; link?: boolean }[] = [
  { key: "rideSignUpsUrl", label: "Ride sign-ups", icon: "rideSignUps", link: true },
  { key: "roomsUrl", label: "Rooms", icon: "rooms", link: true },
  { key: "hotel", label: "Hotel", icon: "hotel" },
  { key: "packingList", label: "Packing list", icon: "packingList" },
  { key: "itinerary", label: "Itinerary", icon: "itinerary" },
]

/** First non-empty line of rich-text HTML, as plain text. */
function htmlFirstLine(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? ""
}

export default function AddTravelInfoButton({
  meetId,
  initial,
  trigger,
}: {
  meetId: string
  initial: TravelInfoForm
  /** Custom trigger; receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const loading = isPending
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TravelInfoForm>(initial)
  const [expanded, setExpanded] = useState<TravelKey | null>(null)
  const { anyUploading, getFieldUploadHandler } = useMeetResourceUploads()
  const { begin, trackUpload, release } = useUnsavedUploads()
  const blocked = loading || anyUploading

  const hasTravelInfo = Object.values(initial).some((v) => v.trim())
  const rowValues = TRAVEL_ROWS.map(({ key, link }) => ({
    key,
    summary: link ? resourceValueLabel(form[key]) : htmlFirstLine(form[key]),
  }))
  const addedCount = rowValues.filter((row) => row.summary).length

  function closeWithoutSaving() {
    if (blocked) return
    release([initial.rideSignUpsUrl, initial.roomsUrl])
    setOpen(false)
  }

  useEffect(() => {
    if (open) {
      setForm(initial)
      setExpanded(null)
      setError(null)
    }
  }, [open, initial])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (anyUploading) return
    setError(null)

    startTransition(async () => {
      try {
        const result = await updateMeet(meetId, form)
        if (!result.ok) {
          setError(result.error)
          return
        }
        release([form.rideSignUpsUrl, form.roomsUrl])
        setOpen(false)
      } catch {
        setError("Something went wrong")
      }
    })
  }

  return (
    <>
      {trigger ? (
        trigger(() => {
          begin()
          setOpen(true)
        })
      ) : (
        <button
          type="button"
          onClick={() => {
            begin()
            setOpen(true)
          }}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-border rounded-md bg-background hover:bg-fill transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 shrink-0"
            aria-hidden="true"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {hasTravelInfo ? "Edit Travel Info" : "Add Travel Info"}
        </button>
      )}

      <Modal
        open={open}
        onClose={closeWithoutSaving}
        closeDisabled={blocked}
        busy={loading}
        header={
          <ResourceModalHeader
            title={hasTravelInfo ? "Edit travel info" : "Add travel info"}
            count={`${addedCount} of ${TRAVEL_ROWS.length} added`}
          />
        }
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeWithoutSaving}
              disabled={blocked}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-fill"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={blocked}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : anyUploading ? "Uploading…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <ResourceList>
          {TRAVEL_ROWS.map(({ key, label, icon, link }, index) => {
            const isExpanded = expanded === key
            const summary = rowValues[index].summary
            const toggle = () => setExpanded(isExpanded ? null : key)
            return (
              <ResourceRow
                key={key}
                icon={<TravelInfoIcon kind={icon} />}
                label={label}
                filled={Boolean(summary)}
                expanded={isExpanded}
                summary={summary}
                closeLabel={link ? "Cancel" : "Done"}
                onToggle={toggle}
                onClear={() => setForm((f) => ({ ...f, [key]: "" }))}
              >
                {link ? (
                  <ResourceFileOrLink
                    onAdd={(url) => {
                      setForm((f) => ({ ...f, [key]: url }))
                      setExpanded(null)
                    }}
                    onUploaded={trackUpload}
                    onUploadingChange={getFieldUploadHandler(key)}
                  />
                ) : (
                  <RichTextField
                    value={form[key]}
                    onChange={(text) => setForm((f) => ({ ...f, [key]: text }))}
                    rows={4}
                  />
                )}
              </ResourceRow>
            )
          })}
        </ResourceList>

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}
