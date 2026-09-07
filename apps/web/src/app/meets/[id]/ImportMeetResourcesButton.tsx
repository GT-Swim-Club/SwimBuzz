"use client"

import { Fragment, useEffect, useState } from "react"
import MeetResourceField from "../MeetResourceField"
import MeetResourceIcon from "@/components/meet/MeetResourceIcon"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import { useMeetResourceUploads } from "@/lib/meet/use-meet-resource-uploads"
import { useUnsavedUploads } from "@/lib/meet/unsaved-uploads"
import type { HeatSheetLink } from "@/lib/meet/meet-files"
import { updateMeet } from "./meet-update.actions"

type ResourceForm = {
  teamCode: string
  packetUrl: string
  entriesSheetUrl: string
  psychSheetUrl: string
  heatSheetUrls: HeatSheetLink[]
  finalsHeatSheetUrls: HeatSheetLink[]
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

function heatSheetLinksEqual(a: HeatSheetLink[], b: HeatSheetLink[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (link, i) =>
      link.url.trim() === b[i].url.trim() &&
      (link.name ?? "").trim() === (b[i].name ?? "").trim()
  )
}

/** Filled sheet links, with one initial empty upload slot when needed. */
function withTrailingEmptySlot(links: HeatSheetLink[]): HeatSheetLink[] {
  const filled = links.filter((link) => link.url.trim())
  return filled.length > 0 ? filled : [{ url: "" }]
}

function filledHeatSheetLinks(links: HeatSheetLink[]): HeatSheetLink[] {
  return links
    .map((l) => ({
      url: l.url.trim(),
      ...(l.name?.trim() ? { name: l.name.trim() } : {}),
    }))
    .filter((l) => l.url)
}

function resourceFileUrls(form: Pick<
  ResourceForm,
  "packetUrl" | "entriesSheetUrl" | "psychSheetUrl" | "heatSheetUrls" | "finalsHeatSheetUrls"
>): string[] {
  return [
    form.packetUrl,
    form.entriesSheetUrl,
    form.psychSheetUrl,
    ...form.heatSheetUrls.map((link) => link.url),
    ...form.finalsHeatSheetUrls.map((link) => link.url),
  ]
}

function editorForm(source: ResourceForm): ResourceForm {
  return {
    ...source,
    heatSheetUrls: withTrailingEmptySlot(source.heatSheetUrls),
    finalsHeatSheetUrls: withTrailingEmptySlot(source.finalsHeatSheetUrls),
  }
}

function snapshotForm(form: ResourceForm): ResourceForm {
  return {
    ...form,
    heatSheetUrls: filledHeatSheetLinks(form.heatSheetUrls),
    finalsHeatSheetUrls: filledHeatSheetLinks(form.finalsHeatSheetUrls),
  }
}

function resourceFormsEqual(a: ResourceForm, b: ResourceForm): boolean {
  return (
    a.teamCode.trim() === b.teamCode.trim() &&
    a.packetUrl.trim() === b.packetUrl.trim() &&
    a.entriesSheetUrl.trim() === b.entriesSheetUrl.trim() &&
    a.psychSheetUrl.trim() === b.psychSheetUrl.trim() &&
    a.liveStreamUrl.trim() === b.liveStreamUrl.trim() &&
    heatSheetLinksEqual(
      filledHeatSheetLinks(a.heatSheetUrls),
      filledHeatSheetLinks(b.heatSheetUrls)
    ) &&
    heatSheetLinksEqual(
      filledHeatSheetLinks(a.finalsHeatSheetUrls),
      filledHeatSheetLinks(b.finalsHeatSheetUrls)
    )
  )
}

function hasAnyResource(form: ResourceForm): boolean {
  return (
    Object.values({
      packetUrl: form.packetUrl,
      entriesSheetUrl: form.entriesSheetUrl,
      psychSheetUrl: form.psychSheetUrl,
      liveStreamUrl: form.liveStreamUrl,
    }).some((v) => v.trim()) ||
    form.heatSheetUrls.some((l) => l.url.trim()) ||
    form.finalsHeatSheetUrls.some((l) => l.url.trim())
  )
}

export default function ImportMeetResourcesButton({
  meetId,
  initial,
}: {
  meetId: string
  initial: ResourceForm
}) {
  const { startTask, tasks } = useImportTask()
  const importing = tasks.some(
    (t) => t.status === "running" && /resources/i.test(t.label)
  )
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [form, setForm] = useState<ResourceForm>(() => ({
    ...initial,
    heatSheetUrls: withTrailingEmptySlot(initial.heatSheetUrls),
    finalsHeatSheetUrls: withTrailingEmptySlot(initial.finalsHeatSheetUrls),
  }))
  const [pendingConfirmations, setPendingConfirmations] = useState<NameConfirmation[]>([])
  const [rosterOptions, setRosterOptions] = useState<RosterPairingOption[]>([])
  const [pairSelections, setPairSelections] = useState<Record<string, string>>({})
  const [cachedSheetParses, setCachedSheetParses] = useState<Record<string, unknown> | null>(
    null
  )
  const { anyUploading, getFieldUploadHandler } = useMeetResourceUploads()
  const { begin, trackUpload, release } = useUnsavedUploads()
  const [pendingForm, setPendingForm] = useState<ResourceForm | null>(null)
  const baseline = pendingForm ?? initial
  const hasResources = hasAnyResource(baseline)

  useEffect(() => {
    if (!pendingForm) return
    if (resourceFormsEqual(pendingForm, initial)) {
      setPendingForm(null)
    }
  }, [initial, pendingForm])

  function openResourceEditor() {
    begin()
    setForm(editorForm(baseline))
    setOpen(true)
  }

  function closeWithoutSaving() {
    if (anyUploading) return
    release(resourceFileUrls(baseline))
    setOpen(false)
  }

  function revertRejectedImport() {
    setPendingForm(null)
    setForm(editorForm(initial))
    release(resourceFileUrls(initial))
  }

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
    }
  }

  async function saveResources(
    snapshot: ResourceForm,
    opts?: {
      nameMappings?: Record<string, string>
      rejectedNames?: string[]
      cachedSheetParses?: Record<string, unknown> | null
    }
  ) {
    const teamCode = snapshot.teamCode.trim()
    if (!teamCode) throw new Error("Team code is required")

    const heatSheetUrls = filledHeatSheetLinks(snapshot.heatSheetUrls)
    const finalsHeatSheetUrls = filledHeatSheetLinks(snapshot.finalsHeatSheetUrls)

    const result = await updateMeet(meetId, {
      teamCode,
      packetUrl: snapshot.packetUrl,
      entriesSheetUrl: snapshot.entriesSheetUrl,
      psychSheetUrl: snapshot.psychSheetUrl,
      heatSheetUrls,
      finalsHeatSheetUrls,
      liveStreamUrl: snapshot.liveStreamUrl,
      nameMappings: opts?.nameMappings,
      rejectedNames: opts?.rejectedNames,
      cachedSheetParses: opts?.cachedSheetParses,
    })
    if (!result.ok) {
      if (result.rejected) revertRejectedImport()
      throw new Error(result.error ?? "Failed to save resources")
    }

    release(resourceFileUrls(snapshot))
    handleSaveResponse({
      nameConfirmations: result.nameConfirmations as NameConfirmation[] | undefined,
      rosterForPairing: result.rosterForPairing as RosterPairingOption[] | undefined,
      cachedSheetParses: result.cachedSheetParses as Record<string, unknown> | undefined,
    })
    if (result.packetWarning) {
      return `Imported resources, but the meet packet could not be parsed: ${result.packetWarning}`
    }
    return "Imported resources successfully"
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (anyUploading || importing) return

    const hasAnyChange = !resourceFormsEqual(form, baseline)

    if (!hasAnyChange) {
      closeWithoutSaving()
      return
    }

    const teamChanged =
      initial.teamCode.trim().toUpperCase() !== form.teamCode.trim().toUpperCase()

    const scrapableKeys = [
      "packetUrl",
      "entriesSheetUrl",
      "psychSheetUrl",
    ] as const

    const initialHeatSheets = filledHeatSheetLinks(initial.heatSheetUrls)
    const nextHeatSheets = filledHeatSheetLinks(form.heatSheetUrls)
    const previousHeatUrls = new Set(initialHeatSheets.map((l) => l.url.trim()))
    const heatHasNewUrl = nextHeatSheets.some(
      (l) => l.url.trim() && !previousHeatUrls.has(l.url.trim())
    )

    const initialFinals = filledHeatSheetLinks(initial.finalsHeatSheetUrls)
    const nextFinals = filledHeatSheetLinks(form.finalsHeatSheetUrls)
    const prevFinalsUrls = new Set(initialFinals.map((l) => l.url.trim()))
    const finalsHasNewUrl = nextFinals.some(
      (l) => l.url.trim() && !prevFinalsUrls.has(l.url.trim())
    )

    const hasRemainingScrapable =
      scrapableKeys.some((key) => form[key].trim()) ||
      nextHeatSheets.length > 0 ||
      nextFinals.length > 0

    const hasScrapableChange =
      scrapableKeys.some((key) => {
        const next = form[key].trim()
        const prev = initial[key].trim()
        return Boolean(next) && next !== prev
      }) ||
      heatHasNewUrl ||
      finalsHasNewUrl ||
      (teamChanged && hasRemainingScrapable)

    const snapshot = snapshotForm(form)
    setPendingForm(snapshot)
    setOpen(false)
    release(resourceFileUrls(snapshot))

    if (hasScrapableChange) {
      void startTask("Importing resources...", saveResources(snapshot))
    } else {
      void saveResources(snapshot).catch((err) => {
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
      await saveResources(pendingForm ?? snapshotForm(form), {
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

  const canAddHeatSheet = form.heatSheetUrls.every((link) => link.url.trim())
  const canAddFinalsHeatSheet = form.finalsHeatSheetUrls.every((link) => link.url.trim())

  function updateHeatLink(index: number, patch: Partial<HeatSheetLink>) {
    setForm((f) => {
      const urls = f.heatSheetUrls.map((link, i) =>
        i === index ? { ...link, ...patch } : link
      )
      return { ...f, heatSheetUrls: withTrailingEmptySlot(urls) }
    })
  }


  function addHeatLink() {
    setForm((f) => ({
      ...f,
      heatSheetUrls: [...f.heatSheetUrls, { url: "" }],
    }))
  }

  function updateFinalsLink(index: number, patch: Partial<HeatSheetLink>) {
    setForm((f) => {
      const urls = f.finalsHeatSheetUrls.map((link, i) =>
        i === index ? { ...link, ...patch } : link
      )
      return { ...f, finalsHeatSheetUrls: withTrailingEmptySlot(urls) }
    })
  }

  function addFinalsLink() {
    setForm((f) => ({
      ...f,
      finalsHeatSheetUrls: [...f.finalsHeatSheetUrls, { url: "" }],
    }))
  }

  return (
    <>
      <button
        type="button"
        onClick={openResourceEditor}
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
        onClose={closeWithoutSaving}
        closeDisabled={anyUploading}
        title={hasResources ? "Edit Resources" : "Add Resources"}
        description="Upload or link meet documents, or add a live stream URL."
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeWithoutSaving}
              disabled={anyUploading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={anyUploading || importing}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {importing ? "Importing…" : anyUploading ? "Uploading…" : "Save"}
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
          onUploaded={trackUpload}
        />
        <MeetResourceField
          label="Entries"
          icon={<MeetResourceIcon kind="entries" />}
          value={form.entriesSheetUrl}
          onChange={(url) => setForm((f) => ({ ...f, entriesSheetUrl: url }))}
          onUploadingChange={getFieldUploadHandler("entries")}
          onUploaded={trackUpload}
        />
        <MeetResourceField
          label="Psych Sheet"
          icon={<MeetResourceIcon kind="psych" />}
          value={form.psychSheetUrl}
          onChange={(url) => setForm((f) => ({ ...f, psychSheetUrl: url }))}
          onUploadingChange={getFieldUploadHandler("psych")}
          onUploaded={trackUpload}
        />
        <div>
          <div className="space-y-4">
        {form.heatSheetUrls.map((link, index) => {
          const isPlaceholder = !link.url.trim()
          const filledBefore = form.heatSheetUrls
            .slice(0, index)
            .filter((l) => l.url.trim()).length
          const sheetNumber = filledBefore + 1
          const label =
            form.heatSheetUrls.length > 1
              ? "Heat Sheet " + sheetNumber
              : "Heat Sheet"

          const resourceField = (
            <MeetResourceField
              label={label}
              icon={<MeetResourceIcon kind="heat" />}
              value={link.url}
              onChange={(url) => updateHeatLink(index, { url })}
              onUploadingChange={getFieldUploadHandler(`heat-${index}`)}
              onUploaded={trackUpload}
              bodyLeading={
                isPlaceholder ? undefined : (
                  <input
                    type="text"
                    value={link.name ?? ""}
                    onChange={(e) => updateHeatLink(index, { name: e.target.value })}
                    placeholder="Optional label"
                    aria-label={`Optional label for heat sheet ${filledBefore + 1}`}
                    className="h-full w-full rounded-lg border border-border px-3 py-2 text-xs bg-background text-foreground-secondary"
                  />
                )
              }
            />
          )
          return <Fragment key={"heat-" + index}>{resourceField}</Fragment>
        })}
          </div>
        {canAddHeatSheet ? (
          <button
            type="button"
            onClick={addHeatLink}
            className="!mt-0 inline-flex self-start text-xs font-medium text-primary hover:text-primary-hover"
          >
            + Add another heat sheet
          </button>
        ) : null}
          </div>

        <div>
          <div className="space-y-4">
            {form.finalsHeatSheetUrls.map((link, index) => {
          const isPlaceholder = !link.url.trim()
          const filledBefore = form.finalsHeatSheetUrls
            .slice(0, index)
            .filter((l) => l.url.trim()).length
          const sheetNumber = filledBefore + 1
          const label =
            form.finalsHeatSheetUrls.length > 1
              ? "Finals Heat Sheet " + sheetNumber
              : "Finals Heat Sheet"

          const resourceField = (
            <MeetResourceField
              label={label}
              icon={<MeetResourceIcon kind="heat" />}
              value={link.url}
              onChange={(url) => updateFinalsLink(index, { url })}
              bodyLeading={
                isPlaceholder ? undefined : (
                  <input
                    type="text"
                    value={link.name ?? ""}
                    onChange={(e) => updateFinalsLink(index, { name: e.target.value })}
                    placeholder="Optional label"
                    aria-label={`Optional label for finals heat sheet ${filledBefore + 1}`}
                    className="h-full w-full rounded-lg border border-border px-3 py-2 text-xs bg-background text-foreground-secondary"
                  />
                )
              }
            />
          )
          return <Fragment key={"finals-" + index}>{resourceField}</Fragment>
        })}
          </div>
        {canAddFinalsHeatSheet ? (
          <button
            type="button"
            onClick={addFinalsLink}
            className="!mt-0 inline-flex self-start text-xs font-medium text-primary hover:text-primary-hover"
          >
            + Add another finals heat sheet
          </button>
        ) : null}
          </div>

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
