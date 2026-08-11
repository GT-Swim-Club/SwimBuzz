"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import MeetResourceField from "../MeetResourceField"
import MeetResourceIcon from "@/components/MeetResourceIcon"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { useImportTask } from "@/components/ImportTaskProvider"
import { useMeetResourceUploads } from "@/lib/use-meet-resource-uploads"
import type { FinalsHeatSheetLink } from "@/lib/meet-files"

type ResourceForm = {
  teamCode: string
  packetUrl: string
  entriesSheetUrl: string
  psychSheetUrl: string
  heatSheetUrl: string
  finalsHeatSheetUrls: FinalsHeatSheetLink[]
  liveStreamUrl: string
}

type NameConfirmation = {
  pdfName: string
  athleteId?: string
  athleteName?: string
  occurrences: number
}

type RosterPairingOption = {
  id: string
  firstName: string
  lastName: string
}

type SaveResourcesResponse = {
  nameConfirmations?: NameConfirmation[]
  rosterForPairing?: RosterPairingOption[]
  cachedSheetParses?: Record<string, unknown>
}

function finalsLinksEqual(a: FinalsHeatSheetLink[], b: FinalsHeatSheetLink[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (link, i) =>
      link.url.trim() === b[i].url.trim() &&
      (link.name ?? "").trim() === (b[i].name ?? "").trim()
  )
}

/** Filled finals links plus one trailing empty upload slot. */
function withTrailingEmptySlot(links: FinalsHeatSheetLink[]): FinalsHeatSheetLink[] {
  const filled = links.filter((l) => l.url.trim())
  const last = links[links.length - 1]
  const trailingEmpty =
    last && !last.url.trim()
      ? { url: "", ...(last.name?.trim() ? { name: last.name } : {}) }
      : { url: "" }
  return [...filled, trailingEmpty]
}

function filledFinalsLinks(links: FinalsHeatSheetLink[]): FinalsHeatSheetLink[] {
  return links
    .map((l) => ({
      url: l.url.trim(),
      ...(l.name?.trim() ? { name: l.name.trim() } : {}),
    }))
    .filter((l) => l.url)
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [form, setForm] = useState<ResourceForm>(() => ({
    ...initial,
    finalsHeatSheetUrls: withTrailingEmptySlot(initial.finalsHeatSheetUrls),
  }))
  const [pendingConfirmations, setPendingConfirmations] = useState<NameConfirmation[]>([])
  const [rosterOptions, setRosterOptions] = useState<RosterPairingOption[]>([])
  const [pairSelections, setPairSelections] = useState<Record<string, string>>({})
  const [cachedSheetParses, setCachedSheetParses] = useState<Record<string, unknown> | null>(
    null
  )
  const { anyUploading, getFieldUploadHandler } = useMeetResourceUploads()

  const hasResources =
    Object.values({
      packetUrl: initial.packetUrl,
      entriesSheetUrl: initial.entriesSheetUrl,
      psychSheetUrl: initial.psychSheetUrl,
      heatSheetUrl: initial.heatSheetUrl,
      liveStreamUrl: initial.liveStreamUrl,
    }).some((v) => v.trim()) || initial.finalsHeatSheetUrls.some((l) => l.url.trim())

  useEffect(() => {
    if (open) {
      setForm({
        ...initial,
        finalsHeatSheetUrls: withTrailingEmptySlot(initial.finalsHeatSheetUrls),
      })
    }
  }, [open, initial])

  function defaultPairSelections(confirmations: NameConfirmation[]): Record<string, string> {
    const next: Record<string, string> = {}
    for (const c of confirmations) {
      next[c.pdfName] = c.athleteId ?? ""
    }
    return next
  }

  function handleSaveResponse(data: SaveResourcesResponse) {
    const confirmations = data.nameConfirmations ?? []
    if (confirmations.length > 0) {
      setPendingConfirmations(confirmations)
      setRosterOptions(data.rosterForPairing ?? [])
      setPairSelections(defaultPairSelections(confirmations))
      setCachedSheetParses(data.cachedSheetParses ?? null)
      setConfirmError(null)
      setConfirmOpen(true)
      router.refresh()
      return
    }
    router.refresh()
  }

  async function saveResources(opts?: {
    nameMappings?: Record<string, string>
    rejectedNames?: string[]
    cachedSheetParses?: Record<string, unknown> | null
  }) {
    const teamCode = form.teamCode.trim()
    if (!teamCode) throw new Error("Team code is required")

    const finalsHeatSheetUrls = filledFinalsLinks(form.finalsHeatSheetUrls)

    const res = await fetch(`/api/meets/${meetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamCode,
        packetUrl: form.packetUrl,
        entriesSheetUrl: form.entriesSheetUrl,
        psychSheetUrl: form.psychSheetUrl,
        heatSheetUrl: form.heatSheetUrl,
        finalsHeatSheetUrls,
        liveStreamUrl: form.liveStreamUrl,
        nameMappings: opts?.nameMappings,
        rejectedNames: opts?.rejectedNames,
        cachedSheetParses: opts?.cachedSheetParses,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Failed to save resources")

    handleSaveResponse(data)
    return "Imported resources successfully"
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const teamChanged =
      initial.teamCode.trim().toUpperCase() !== form.teamCode.trim().toUpperCase()

    const hasAnyChange =
      teamChanged ||
      initial.packetUrl.trim() !== form.packetUrl.trim() ||
      initial.entriesSheetUrl.trim() !== form.entriesSheetUrl.trim() ||
      initial.psychSheetUrl.trim() !== form.psychSheetUrl.trim() ||
      initial.heatSheetUrl.trim() !== form.heatSheetUrl.trim() ||
      !finalsLinksEqual(
        filledFinalsLinks(initial.finalsHeatSheetUrls),
        filledFinalsLinks(form.finalsHeatSheetUrls)
      ) ||
      initial.liveStreamUrl.trim() !== form.liveStreamUrl.trim()

    if (!hasAnyChange) {
      setOpen(false)
      return
    }

    const scrapableKeys = [
      "packetUrl",
      "entriesSheetUrl",
      "psychSheetUrl",
      "heatSheetUrl",
    ] as const

    const initialFinals = filledFinalsLinks(initial.finalsHeatSheetUrls)
    const nextFinals = filledFinalsLinks(form.finalsHeatSheetUrls)
    const finalsScrapableChange =
      !finalsLinksEqual(initialFinals, nextFinals) &&
      (nextFinals.length > 0 || initialFinals.length > 0)

    const hasScrapableChange =
      scrapableKeys.some((key) => {
        const next = form[key].trim()
        const prev = initial[key].trim()
        return Boolean(next) && next !== prev
      }) ||
      finalsScrapableChange ||
      (teamChanged &&
        (scrapableKeys.some((key) => form[key].trim() || initial[key].trim()) ||
          nextFinals.length > 0 ||
          initialFinals.length > 0))

    setOpen(false)

    if (hasScrapableChange) {
      requireScraper(() => void startTask("Importing resources...", saveResources()))
    } else {
      void saveResources().catch((err) => {
        startTask(
          "Saving resources...",
          Promise.reject(
            err instanceof Error ? err : new Error("Failed to save resources")
          )
        )
      })
    }
  }

  function closeConfirmWithoutPairing() {
    if (loading) return
    setConfirmOpen(false)
    setPendingConfirmations([])
    setRosterOptions([])
    setPairSelections({})
    setCachedSheetParses(null)
    setConfirmError(null)
    router.refresh()
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault()

    const nameMappings: Record<string, string> = {}
    const rejectedNames: string[] = []
    for (const c of pendingConfirmations) {
      const selected = (pairSelections[c.pdfName] ?? "").trim()
      if (selected) {
        nameMappings[c.pdfName] = selected
      } else {
        rejectedNames.push(c.pdfName)
      }
    }

    if (Object.keys(nameMappings).length === 0) {
      closeConfirmWithoutPairing()
      return
    }

    setLoading(true)
    setConfirmError(null)

    try {
      await saveResources({
        nameMappings,
        rejectedNames,
        cachedSheetParses,
      })
      setConfirmOpen(false)
      setPendingConfirmations([])
      setRosterOptions([])
      setPairSelections({})
      setCachedSheetParses(null)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Failed to save paired athletes")
    } finally {
      setLoading(false)
    }
  }

  const pairedCount = pendingConfirmations.filter((c) =>
    Boolean((pairSelections[c.pdfName] ?? "").trim())
  ).length

  function updateFinalsLink(index: number, patch: Partial<FinalsHeatSheetLink>) {
    setForm((f) => {
      const urls = f.finalsHeatSheetUrls.map((link, i) =>
        i === index ? { ...link, ...patch } : link
      )
      return { ...f, finalsHeatSheetUrls: withTrailingEmptySlot(urls) }
    })
  }

  function removeFinalsLink(index: number) {
    setForm((f) => ({
      ...f,
      finalsHeatSheetUrls: withTrailingEmptySlot(
        f.finalsHeatSheetUrls.filter((_, i) => i !== index)
      ),
    }))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
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
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
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

        {form.finalsHeatSheetUrls.map((link, index) => {
          const isPlaceholder = !link.url.trim()
          const filledBefore = form.finalsHeatSheetUrls
            .slice(0, index)
            .filter((l) => l.url.trim()).length
          const label = isPlaceholder
            ? "Finals Heat Sheet"
            : `Finals Heat Sheet ${filledBefore + 1}`

          return (
            <div key={`finals-${index}`} className="space-y-1.5">
              <MeetResourceField
                label={label}
                icon={<MeetResourceIcon kind="heat" />}
                value={link.url}
                onChange={(url) => updateFinalsLink(index, { url })}
                onUploadingChange={getFieldUploadHandler(`finals-${index}`)}
              />
              {!isPlaceholder ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={link.name ?? ""}
                    onChange={(e) => updateFinalsLink(index, { name: e.target.value })}
                    placeholder="Optional label (e.g. Sunday Finals)"
                    className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs bg-background text-foreground-secondary"
                  />
                  <button
                    type="button"
                    onClick={() => removeFinalsLink(index)}
                    className="shrink-0 text-foreground-tertiary hover:text-red-500"
                    aria-label={`Remove ${label}`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}

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
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
          />
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={closeConfirmWithoutPairing}
        closeDisabled={loading}
        busy={loading}
        title="Pair unmatched athletes"
        description="These names were found on a psych, heat, or finals heat sheet but did not match the roster. Pair them to a roster athlete to include their entries."
        onSubmit={handleConfirmSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeConfirmWithoutPairing}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={loading || pairedCount === 0}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading
                ? "Saving…"
                : pairedCount > 0
                  ? `Save ${pairedCount} paired`
                  : "Save paired"}
            </button>
          </ModalFooter>
        }
      >
        <ul className="space-y-3">
          {pendingConfirmations.map((c) => {
            const selected = pairSelections[c.pdfName] ?? ""
            const suggested =
              c.athleteId && c.athleteName
                ? { id: c.athleteId, name: c.athleteName }
                : null
            return (
              <li
                key={c.pdfName}
                className="rounded-xl border bg-fill-secondary px-4 py-3 border-border"
              >
                <p className="text-sm text-foreground">
                  <strong>{c.pdfName}</strong>
                </p>
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  {c.occurrences} entr{c.occurrences === 1 ? "y" : "ies"} with this spelling
                  {suggested ? (
                    <span>
                      {" "}
                      · suggested match: {suggested.name}
                    </span>
                  ) : null}
                </p>
                <label className="mt-3 block">
                  <span className="sr-only">Roster athlete for {c.pdfName}</span>
                  <select
                    value={selected}
                    onChange={(e) =>
                      setPairSelections((prev) => ({
                        ...prev,
                        [c.pdfName]: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
                  >
                    <option value="">Leave unmatched</option>
                    {rosterOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.lastName}, {a.firstName}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            )
          })}
        </ul>
        {confirmError && (
          <p className="text-sm text-error">{confirmError}</p>
        )}
      </Modal>
    </>
  )
}
