"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import MeetResourceField from "../MeetResourceField"
import TravelInfoIcon, { type TravelInfoKind } from "@/components/TravelInfoIcon"
import Modal, { ModalFooter } from "@/components/Modal"
import { useMeetResourceUploads } from "@/lib/use-meet-resource-uploads"
import { useUnsavedUploads } from "@/lib/unsaved-uploads"
import RichTextField from "@/components/RichTextField"

export type TravelInfoForm = {
  rideSignUpsUrl: string
  roomsUrl: string
  hotel: string
  packingList: string
  itinerary: string
}

const TRAVEL_LINK_FIELDS: {
  key: "rideSignUpsUrl" | "roomsUrl"
  label: string
  icon: TravelInfoKind
}[] = [
  { key: "rideSignUpsUrl", label: "Ride Sign-Ups", icon: "rideSignUps" },
  { key: "roomsUrl", label: "Rooms", icon: "rooms" },
]

const TRAVEL_TEXT_FIELDS: {
  key: "hotel" | "packingList" | "itinerary"
  label: string
  icon: TravelInfoKind
  rows: number
  compact?: boolean
}[] = [
  { key: "hotel", label: "Hotel", icon: "hotel", rows: 1, compact: true },
  { key: "packingList", label: "Packing List", icon: "packingList", rows: 1 },
  { key: "itinerary", label: "Itinerary", icon: "itinerary", rows: 1 },
]

export default function AddTravelInfoButton({
  meetId,
  initial,
}: {
  meetId: string
  initial: TravelInfoForm
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TravelInfoForm>(initial)
  const { anyUploading, getFieldUploadHandler } = useMeetResourceUploads()
  const { begin, trackUpload, release } = useUnsavedUploads()
  const blocked = loading || anyUploading

  const hasTravelInfo = Object.values(initial).some((v) => v.trim())

  function closeWithoutSaving() {
    if (blocked) return
    release([initial.rideSignUpsUrl, initial.roomsUrl])
    setOpen(false)
  }

  useEffect(() => {
    if (open) {
      setForm(initial)
      setError(null)
    }
  }, [open, initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (anyUploading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/meets/${meetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save travel info")
        return
      }
      release([form.rideSignUpsUrl, form.roomsUrl])
      setOpen(false)
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
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

      <Modal
        open={open}
        onClose={closeWithoutSaving}
        closeDisabled={blocked}
        busy={loading}
        title={hasTravelInfo ? "Edit Travel Info" : "Add Travel Info"}
        description="Link ride sign-ups and rooms, or add hotel, packing list, and itinerary notes."
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeWithoutSaving}
              disabled={blocked}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-fill border-border"
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
        {TRAVEL_LINK_FIELDS.map(({ key, label, icon }) => (
          <MeetResourceField
            key={key}
            label={label}
            icon={<TravelInfoIcon kind={icon} />}
            value={form[key]}
            onChange={(url) => setForm((f) => ({ ...f, [key]: url }))}
            onUploadingChange={getFieldUploadHandler(key)}
            onUploaded={trackUpload}
          />
        ))}

        {TRAVEL_TEXT_FIELDS.map(({ key, label, icon, rows, compact }) => (
          <RichTextField
            key={key}
            label={label}
            icon={<TravelInfoIcon kind={icon} />}
            value={form[key]}
            onChange={(text) => setForm((f) => ({ ...f, [key]: text }))}
            rows={rows}
            compact={compact}
          />
        ))}

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}
