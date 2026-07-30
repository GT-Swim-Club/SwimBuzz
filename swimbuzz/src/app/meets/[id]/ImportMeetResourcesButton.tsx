"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import MeetResourceField from "../MeetResourceField"
import MeetResourceIcon from "@/components/MeetResourceIcon"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { useImportTask } from "@/components/ImportTaskProvider"
import { useMeetResourceUploads } from "@/lib/use-meet-resource-uploads"

type ResourceForm = {
  teamCode: string
  packetUrl: string
  entriesSheetUrl: string
  psychSheetUrl: string
  heatSheetUrl: string
  liveStreamUrl: string
}

export default function ImportMeetResourcesButton({
  meetId,
  initial,
}: {
  meetId: string
  initial: ResourceForm
}) {
  const router = useRouter()
  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ResourceForm>(initial)
  const { anyUploading, getFieldUploadHandler } = useMeetResourceUploads()

  const hasResources = Object.values({
    packetUrl: initial.packetUrl,
    entriesSheetUrl: initial.entriesSheetUrl,
    psychSheetUrl: initial.psychSheetUrl,
    heatSheetUrl: initial.heatSheetUrl,
    liveStreamUrl: initial.liveStreamUrl,
  }).some((v) => v.trim())

  useEffect(() => {
    if (open) {
      setForm(initial)
    }
  }, [open, initial])

  async function saveResources() {
    const teamCode = form.teamCode.trim()
    if (!teamCode) throw new Error("Team code is required")

    const res = await fetch(`/api/meets/${meetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, teamCode }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Failed to save resources")
    
    router.refresh()
    return "Imported resources successfully"
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const scrapableKeys = [
      "packetUrl",
      "entriesSheetUrl",
      "psychSheetUrl",
      "heatSheetUrl",
    ] as const
    
    const teamChanged = initial.teamCode.trim().toUpperCase() !== form.teamCode.trim().toUpperCase()
    
    const hasScrapableChange =
      scrapableKeys.some((key) => {
        const next = form[key].trim()
        const prev = initial[key].trim()
        return Boolean(next) && next !== prev
      }) ||
      (teamChanged &&
        scrapableKeys.some((key) => form[key].trim() || initial[key].trim()))

    setOpen(false) // Close immediately
    const action = hasScrapableChange ? () => requireScraper(() => void startTask("Importing resources...", saveResources())) : () => void startTask("Importing resources...", saveResources())
    action()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-border rounded-md dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:bg-background-elevated transition-colors"
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
        {hasResources ? "Edit Resources" : "Add Resources"}
      </button>

      <Modal
        open={open}
        maxWidth="xl"
        onClose={() => setOpen(false)}
        title={hasResources ? "Edit Resources" : "Add Resources"}
        description="Upload or link meet documents, or add a live stream URL."
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={anyUploading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {anyUploading ? "Uploading…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <div>
          <label className="block text-xs font-medium text-foreground-secondary mb-1">
            Team code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.teamCode}
            onChange={(e) => setForm((f) => ({ ...f, teamCode: e.target.value }))}
            placeholder="e.g., GTSC"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
            Entries for this team will be parsed from uploaded sheets.
          </p>
        </div>

        <MeetResourceField
          label="Meet Packet"
          icon={<MeetResourceIcon kind="packet" />}
          value={form.packetUrl}
          onChange={(url) => setForm((f) => ({ ...f, packetUrl: url }))}
          onUploadingChange={getFieldUploadHandler("packet")}
        />
        <MeetResourceField
          label="Entries"
          icon={<MeetResourceIcon kind="entries" />}
          value={form.entriesSheetUrl}
          onChange={(url) => setForm((f) => ({ ...f, entriesSheetUrl: url }))}
          onUploadingChange={getFieldUploadHandler("entries")}
        />
        <MeetResourceField
          label="Psych Sheet"
          icon={<MeetResourceIcon kind="psych" />}
          value={form.psychSheetUrl}
          onChange={(url) => setForm((f) => ({ ...f, psychSheetUrl: url }))}
          onUploadingChange={getFieldUploadHandler("psych")}
        />
        <MeetResourceField
          label="Heat Sheet"
          icon={<MeetResourceIcon kind="heat" />}
          value={form.heatSheetUrl}
          onChange={(url) => setForm((f) => ({ ...f, heatSheetUrl: url }))}
          onUploadingChange={getFieldUploadHandler("heat")}
        />

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary mb-1">
            <MeetResourceIcon kind="liveStream" />
            Live Stream
          </label>
          <input
            type="url"
            value={form.liveStreamUrl}
            onChange={(e) =>
              setForm((f) => ({ ...f, liveStreamUrl: e.target.value }))
            }
            placeholder="https://…"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
          />
        </div>
      </Modal>
    </>
  )
}
