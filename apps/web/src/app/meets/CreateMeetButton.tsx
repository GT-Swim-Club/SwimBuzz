"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { emptyMeetForm, type MeetFormState } from "./MeetFields"
import MeetFormModal from "./MeetFormModal"
import { meetPath } from "@/lib/slug"
import { useUnsavedUploads } from "@/lib/meet/unsaved-uploads"
import { useImportTask } from "@/components/ui/ImportTaskProvider"

function meetImageUrls(form: Pick<MeetFormState, "iconUrl" | "bannerUrl">) {
  return [form.iconUrl, form.bannerUrl]
}

export default function CreateMeetButton({ seasons }: { seasons: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MeetFormState>(emptyMeetForm)
  const { begin, trackUpload, release } = useUnsavedUploads()
  const { startTask } = useImportTask()

  function openModal() {
    begin()
    setForm(emptyMeetForm)
    setError(null)
    setOpen(true)
  }

  function closeWithoutSaving() {
    if (loading) return
    release()
    setOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/meets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to create meet")
        return
      }
      release(meetImageUrls(form))
      setOpen(false)
      if (data.packetWarning) {
        startTask(
          "Creating meet...",
          Promise.resolve(`Meet created, but the meet packet could not be parsed: ${data.packetWarning}`)
        )
      }
      router.push(meetPath(data.slug ?? data.id))
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
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-text hover:bg-primary-hover transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New meet
      </button>

      <MeetFormModal
        open={open}
        title="Create meet"
        form={form}
        setForm={setForm}
        seasons={seasons}
        onUploaded={trackUpload}
        onClose={closeWithoutSaving}
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Create meet"
        loadingLabel="Creating…"
        error={error}
      />
    </>
  )
}
