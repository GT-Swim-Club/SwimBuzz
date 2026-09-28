"use client"

import { useEffect, useState, type ReactNode } from "react"
import MeetResourceIcon from "@/components/meet/MeetResourceIcon"
import { AppIcon } from "@/components/ui/AppIcon"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import {
  ResourceFileOrLink,
  ResourceList,
  ResourceModalHeader,
  ResourceRemoveButton,
  ResourceRow,
  resourceInputClass,
  resourceValueLabel,
} from "@/components/meet/ResourceRows"
import { useResultsImport, type ResultsImportSource } from "@/components/meet/useResultsImport"
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
  swimphoneUrl: string
  resultsUrl: string
}

type SingleKey = "packetUrl" | "entriesSheetUrl" | "psychSheetUrl" | "resultsUrl"
type MultiKey = "heatSheetUrls" | "finalsHeatSheetUrls"
type LinkKey = "liveStreamUrl" | "swimphoneUrl"
type RowKey = SingleKey | MultiKey | LinkKey

type RowDef =
  | { key: SingleKey; kind: "single"; label: string; icon: ReactNode; accept?: string; placeholder?: string }
  | { key: MultiKey; kind: "multi"; label: string; icon: ReactNode }
  | { key: LinkKey; kind: "link"; label: string; icon: ReactNode; placeholder: string }

const ROWS: RowDef[] = [
  { key: "packetUrl", kind: "single", label: "Meet packet", icon: <MeetResourceIcon kind="packet" /> },
  { key: "entriesSheetUrl", kind: "single", label: "Entries", icon: <MeetResourceIcon kind="entries" /> },
  { key: "psychSheetUrl", kind: "single", label: "Psych sheet", icon: <MeetResourceIcon kind="psych" /> },
  { key: "heatSheetUrls", kind: "multi", label: "Heat sheets", icon: <MeetResourceIcon kind="heat" /> },
  { key: "finalsHeatSheetUrls", kind: "multi", label: "Finals heat sheets", icon: <MeetResourceIcon kind="heat" /> },
  { key: "liveStreamUrl", kind: "link", label: "Live stream", icon: <MeetResourceIcon kind="liveStream" />, placeholder: "https://…" },
  {
    key: "swimphoneUrl",
    kind: "link",
    label: "SwimPhone results",
    icon: <AppIcon name="link" />,
    placeholder: "https://www.swimphone.com/meets/...",
  },
  {
    key: "resultsUrl",
    kind: "single",
    label: "Results PDF",
    icon: <AppIcon name="fileText" />,
    accept: ".pdf,application/pdf",
    placeholder: "Or paste a link to the PDF",
  },
]

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

function filledHeatSheetLinks(links: HeatSheetLink[]): HeatSheetLink[] {
  return links
    .map((l) => ({
      url: l.url.trim(),
      ...(l.name?.trim() ? { name: l.name.trim() } : {}),
    }))
    .filter((l) => l.url)
}

function resourceFileUrls(form: ResourceForm): string[] {
  return [
    form.packetUrl,
    form.entriesSheetUrl,
    form.psychSheetUrl,
    form.resultsUrl,
    ...form.heatSheetUrls.map((link) => link.url),
    ...form.finalsHeatSheetUrls.map((link) => link.url),
  ]
}

function resourceUrls(form: ResourceForm): string[] {
  return [...resourceFileUrls(form), form.liveStreamUrl, form.swimphoneUrl]
    .map((url) => url.trim())
    .filter(Boolean)
}

function snapshotForm(form: ResourceForm): ResourceForm {
  return {
    ...form,
    heatSheetUrls: filledHeatSheetLinks(form.heatSheetUrls),
    finalsHeatSheetUrls: filledHeatSheetLinks(form.finalsHeatSheetUrls),
  }
}

/** Compares everything except the results fields, which the results import owns. */
function sheetResourcesEqual(a: ResourceForm, b: ResourceForm): boolean {
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

function resourceFormsEqual(a: ResourceForm, b: ResourceForm): boolean {
  return (
    sheetResourcesEqual(a, b) &&
    a.swimphoneUrl.trim() === b.swimphoneUrl.trim() &&
    a.resultsUrl.trim() === b.resultsUrl.trim()
  )
}

function rowFilled(form: ResourceForm, def: RowDef): boolean {
  if (def.kind === "multi") return form[def.key].some((l) => l.url.trim())
  return Boolean(form[def.key].trim())
}

/** Which results import (if any) this edit should run: a new or changed link/PDF. */
function pendingResultsImport(form: ResourceForm, baseline: ResourceForm): ResultsImportSource | null {
  const swimphone = form.swimphoneUrl.trim()
  if (swimphone && swimphone !== baseline.swimphoneUrl.trim()) {
    return { kind: "swimphone", url: swimphone }
  }
  const pdf = form.resultsUrl.trim()
  if (pdf && pdf !== baseline.resultsUrl.trim()) return { kind: "pdf", pdfUrl: pdf }
  return null
}

/** A SwimPhone link / results PDF the results import will write to the meet once it finishes. */
type PendingResult = { key: "swimphoneUrl" | "resultsUrl"; value: string; previous: string }

/**
 * Overlay an in-flight results link until the server copy changes from what it was
 * when the import started (the import saves it, possibly normalized).
 */
function withPendingResult(
  form: ResourceForm,
  server: ResourceForm,
  pending: PendingResult | null
): ResourceForm {
  if (!pending) return form
  if (server[pending.key].trim() !== pending.previous.trim()) return form
  return { ...form, [pending.key]: pending.value }
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

export default function ImportMeetResourcesButton({
  meetId,
  season,
  course,
  initial,
  trigger,
  onRemove,
}: {
  meetId: string
  season: string
  /** Default course for imported results. */
  course: string
  initial: ResourceForm
  /** Custom trigger; receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
  /** Resource URLs removed by a save, reported before the save lands so the page can hide them. */
  onRemove?: (urls: string[], saved: Promise<unknown>) => void
}) {
  const { startTask, tasks } = useImportTask()
  const importing = tasks.some(
    (t) => t.status === "running" && /resources/i.test(t.label)
  )
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<RowKey | null>(null)
  const [teamEditing, setTeamEditing] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [form, setForm] = useState<ResourceForm>(initial)
  const [pendingConfirmations, setPendingConfirmations] = useState<NameConfirmation[]>([])
  const [rosterOptions, setRosterOptions] = useState<RosterPairingOption[]>([])
  const [pairSelections, setPairSelections] = useState<Record<string, string>>({})
  const [cachedSheetParses, setCachedSheetParses] = useState<Record<string, unknown> | null>(
    null
  )
  const { anyUploading, getFieldUploadHandler } = useMeetResourceUploads()
  const { begin, trackUpload, release } = useUnsavedUploads()
  const [pendingForm, setPendingForm] = useState<ResourceForm | null>(null)
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null)
  const baseline = withPendingResult(pendingForm ?? initial, initial, pendingResult)
  const hasResources = ROWS.some((def) => rowFilled(baseline, def))
  const { startImport, pairingModal } = useResultsImport({
    meetId,
    season,
    pairingBlocked: open || confirmOpen,
  })

  useEffect(() => {
    if (!pendingForm) return
    // The results import saves its own link (SwimPhone may normalize it), so only the
    // sheet resources have to land before the server copy is trusted again.
    if (sheetResourcesEqual(pendingForm, initial)) {
      setPendingForm(null)
    }
  }, [initial, pendingForm])

  function openResourceEditor() {
    begin()
    setForm(snapshotForm(baseline))
    setExpanded(null)
    setTeamEditing(false)
    setFormError(null)
    setOpen(true)
  }

  function closeWithoutSaving() {
    if (anyUploading) return
    release(resourceFileUrls(baseline))
    setOpen(false)
  }

  function revertRejectedImport() {
    setPendingForm(null)
    setForm(snapshotForm(initial))
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
      /** Results fields handed to the results import instead of saved here. */
      skip?: ("swimphoneUrl" | "resultsUrl")[]
    }
  ) {
    const teamCode = snapshot.teamCode.trim()
    if (!teamCode) throw new Error("Team code is required")

    const result = await updateMeet(meetId, {
      teamCode,
      packetUrl: snapshot.packetUrl,
      entriesSheetUrl: snapshot.entriesSheetUrl,
      psychSheetUrl: snapshot.psychSheetUrl,
      heatSheetUrls: filledHeatSheetLinks(snapshot.heatSheetUrls),
      finalsHeatSheetUrls: filledHeatSheetLinks(snapshot.finalsHeatSheetUrls),
      liveStreamUrl: snapshot.liveStreamUrl,
      ...(opts?.skip?.includes("swimphoneUrl") ? {} : { swimphoneUrl: snapshot.swimphoneUrl }),
      ...(opts?.skip?.includes("resultsUrl") ? {} : { resultsUrl: snapshot.resultsUrl }),
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

  const resultsImport = pendingResultsImport(form, baseline)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (anyUploading || importing) return

    if (resourceFormsEqual(form, baseline)) {
      closeWithoutSaving()
      return
    }

    if (!form.teamCode.trim()) {
      setTeamEditing(true)
      setFormError("Team code is required")
      return
    }

    const teamChanged =
      initial.teamCode.trim().toUpperCase() !== form.teamCode.trim().toUpperCase()

    const scrapableKeys = [
      "packetUrl",
      "entriesSheetUrl",
      "psychSheetUrl",
    ] as const

    const nextHeatSheets = filledHeatSheetLinks(form.heatSheetUrls)
    const previousHeatUrls = new Set(
      filledHeatSheetLinks(initial.heatSheetUrls).map((l) => l.url)
    )
    const heatHasNewUrl = nextHeatSheets.some((l) => !previousHeatUrls.has(l.url))

    const nextFinals = filledHeatSheetLinks(form.finalsHeatSheetUrls)
    const prevFinalsUrls = new Set(
      filledHeatSheetLinks(initial.finalsHeatSheetUrls).map((l) => l.url)
    )
    const finalsHasNewUrl = nextFinals.some((l) => !prevFinalsUrls.has(l.url))

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
    const importSource = pendingResultsImport(snapshot, baseline)
    const skip =
      importSource?.kind === "swimphone" ? "swimphoneUrl" : importSource ? "resultsUrl" : null
    // Skip the resource save when the only change is the results link the import will store.
    const needsSave =
      !sheetResourcesEqual(snapshot, baseline) ||
      (skip !== "swimphoneUrl" && snapshot.swimphoneUrl.trim() !== baseline.swimphoneUrl.trim()) ||
      (skip !== "resultsUrl" && snapshot.resultsUrl.trim() !== baseline.resultsUrl.trim())

    setPendingForm(snapshot)
    setOpen(false)
    release(resourceFileUrls(snapshot))

    let savePromise: Promise<string> | null = null
    if (needsSave) {
      savePromise = saveResources(snapshot, { skip: skip ? [skip] : [] })
      const kept = new Set(resourceUrls(snapshot))
      const removed = resourceUrls(baseline).filter((url) => !kept.has(url))
      if (removed.length > 0) onRemove?.(removed, savePromise)
      if (hasScrapableChange) {
        void startTask("Importing resources...", savePromise)
      } else {
        void savePromise.catch((err) => {
          startTask(
            "Saving resources...",
            Promise.reject(
              err instanceof Error ? err : new Error("Failed to save resources")
            )
          )
        })
      }
    }

    if (importSource) {
      const saved = savePromise
      const key = importSource.kind === "swimphone" ? "swimphoneUrl" : "resultsUrl"
      const result: PendingResult = { key, value: snapshot[key], previous: initial[key] }
      startImport(importSource, {
        team: snapshot.teamCode,
        course,
        // Import after the team code/resources land; a failed save is reported by its own task.
        before: saved ? () => saved.catch(() => undefined) : undefined,
        onStart: () => setPendingResult(result),
        onSettled: (ok) => {
          if (!ok) setPendingResult((current) => (current === result ? null : current))
        },
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
      const snapshot = pendingForm ?? snapshotForm(form)
      await saveResources(snapshot, {
        nameMappings,
        rejectedNames,
        cachedSheetParses,
        // The results fields were already handled by the first save or the results import.
        skip: ["swimphoneUrl", "resultsUrl"],
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

  const addedCount = ROWS.filter((def) => rowFilled(form, def)).length
  const showTeamInput = teamEditing || !form.teamCode.trim()

  function setSingle(key: SingleKey | LinkKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function updateLinks(key: MultiKey, update: (links: HeatSheetLink[]) => HeatSheetLink[]) {
    setForm((f) => ({ ...f, [key]: update(f[key]) }))
  }

  function renderRow(def: RowDef) {
    const isExpanded = expanded === def.key
    const filled = rowFilled(form, def)
    const toggle = () => setExpanded(isExpanded ? null : def.key)

    if (def.kind === "multi") {
      const links = form[def.key]
      const n = links.length
      return (
        <ResourceRow
          key={def.key}
          icon={def.icon}
          label={def.label}
          filled={filled}
          expanded={isExpanded}
          count={`${n} file${n === 1 ? "" : "s"}`}
          onToggle={toggle}
        >
          {links.map((link, index) => (
            <div key={link.url + index} className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background py-[5px] pl-2.5 pr-1.5">
                <span
                  title={link.url}
                  className="min-w-0 flex-1 truncate text-[13px] text-foreground"
                >
                  {resourceValueLabel(link.url)}
                </span>
                <ResourceRemoveButton
                  label="Remove"
                  onClick={() => updateLinks(def.key, (l) => l.filter((_, i) => i !== index))}
                />
              </div>
              <input
                type="text"
                value={link.name ?? ""}
                onChange={(e) =>
                  updateLinks(def.key, (l) =>
                    l.map((item, i) => (i === index ? { ...item, name: e.target.value } : item))
                  )
                }
                placeholder="Optional label"
                aria-label={`Optional label for ${def.label.toLowerCase()} ${index + 1}`}
                className={`${resourceInputClass} !w-[120px] shrink-0 !text-xs text-foreground-secondary`}
              />
            </div>
          ))}
          <ResourceFileOrLink
            onAdd={(url) => updateLinks(def.key, (l) => [...l, { url }])}
            onUploaded={trackUpload}
            onUploadingChange={getFieldUploadHandler(def.key)}
          />
        </ResourceRow>
      )
    }

    if (def.kind === "link") {
      return (
        <ResourceRow
          key={def.key}
          icon={def.icon}
          label={def.label}
          filled={filled}
          expanded={isExpanded}
          summary={form[def.key]}
          onToggle={toggle}
          onClear={() => setSingle(def.key, "")}
        >
          <input
            type="url"
            value={form[def.key]}
            onChange={(e) => setSingle(def.key, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                setExpanded(null)
              }
            }}
            placeholder={def.placeholder}
            aria-label={def.label}
            autoFocus
            className={resourceInputClass}
          />
        </ResourceRow>
      )
    }

    return (
      <ResourceRow
        key={def.key}
        icon={def.icon}
        label={def.label}
        filled={filled}
        expanded={isExpanded}
        summary={resourceValueLabel(form[def.key])}
        closeLabel="Cancel"
        onToggle={toggle}
        onClear={() => setSingle(def.key, "")}
      >
        <ResourceFileOrLink
          accept={def.accept}
          linkPlaceholder={def.placeholder}
          onAdd={(url) => {
            setSingle(def.key, url)
            setExpanded(null)
          }}
          onUploaded={trackUpload}
          onUploadingChange={getFieldUploadHandler(def.key)}
        />
      </ResourceRow>
    )
  }

  const teamCode = (
    <div
      title="Entries and results for this team are parsed from uploaded files."
      className="flex h-[25px] shrink-0 items-center gap-1.5 whitespace-nowrap text-xs leading-4 text-foreground-tertiary"
    >
      <span>Team code:</span>
      {showTeamInput ? (
        <>
          <input
            type="text"
            value={form.teamCode}
            onChange={(e) => {
              setFormError(null)
              setForm((f) => ({ ...f, teamCode: e.target.value }))
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (form.teamCode.trim()) setTeamEditing(false)
              }
            }}
            placeholder="e.g., GTSC"
            aria-label="Team code"
            autoFocus={teamEditing}
            className="box-border min-w-11 max-w-[200px] rounded-md border border-border bg-background px-1.5 py-0.5 text-xs leading-4 text-foreground outline-none [field-sizing:content] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
          />
          <button
            type="button"
            onClick={() => {
              if (form.teamCode.trim()) setTeamEditing(false)
            }}
            aria-label="Save team code"
            title="Save team code"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-primary transition-colors hover:bg-fill-secondary hover:text-primary-hover"
          >
            <AppIcon name="check" className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="font-medium text-foreground">{form.teamCode}</span>
          <button
            type="button"
            onClick={() => setTeamEditing(true)}
            aria-label="Edit team code"
            title="Edit team code"
            className="-ml-[3px] inline-flex h-5 w-5 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-fill-secondary hover:text-primary"
          >
            <PencilIcon />
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      {trigger ? (
        trigger(openResourceEditor)
      ) : (
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
      )}

      <Modal
        open={open}
        onClose={closeWithoutSaving}
        closeDisabled={anyUploading}
        header={
          <ResourceModalHeader
            title={hasResources ? "Edit Competition Resources" : "Add Competition Resources"}
            count={`${addedCount} of ${ROWS.length} added`}
            aside={teamCode}
          />
        }
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeWithoutSaving}
              disabled={anyUploading}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-fill"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={anyUploading || importing}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {importing
                ? "Importing…"
                : anyUploading
                  ? "Uploading…"
                  : resultsImport
                    ? "Save and import results"
                    : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <ResourceList>{ROWS.map(renderRow)}</ResourceList>
        {formError ? <p className="text-sm text-error">{formError}</p> : null}
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
      {pairingModal}
    </>
  )
}
