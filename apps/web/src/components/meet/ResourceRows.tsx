"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AppIcon } from "@/components/ui/AppIcon"
import { FileDropzone } from "@/components/ui/FileDropzone"
import { isStoredMeetFileUrl } from "@/lib/meet/meet-files"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"

/** Status-list building blocks shared by the meet resource, travel and photo modals. */

export const resourceInputClass =
  "box-border w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-[7px] text-[13px] text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"

export const RESOURCE_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"

/** Display name for a stored file or pasted link. */
export function resourceValueLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (isStoredMeetFileUrl(trimmed)) {
    const last = trimmed.split("?")[0].split("/").pop() ?? trimmed
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  }
  return trimmed
}

export async function uploadMeetResourceFile(file: File): Promise<string> {
  const body = new FormData()
  body.append("file", file)
  const res = await fetch("/api/meets/upload", { method: "POST", body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error ?? `Upload failed for ${file.name}`)
  return data.url as string
}

export function ResourceModalHeader({
  title,
  count,
  aside,
}: {
  title: string
  count: string
  /** Right-side control; stacks the count under the title when present. */
  aside?: ReactNode
}) {
  const countEl = (
    <p className="m-0 shrink-0 whitespace-nowrap text-sm text-foreground-secondary tabular-nums">{count}</p>
  )
  if (aside) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-medium leading-snug text-foreground">{title}</h2>
          <div className="mt-1">{countEl}</div>
        </div>
        {aside}
      </div>
    )
  }
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="min-w-0 text-lg font-medium leading-snug text-foreground">{title}</h2>
      {countEl}
    </div>
  )
}

export function ResourceList({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-border">{children}</div>
}

export function ResourceIcon({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 text-foreground-tertiary [&_svg]:h-3.5 [&_svg]:w-3.5">{children}</span>
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-error/10 hover:text-error"
    >
      <AppIcon name="x" className="h-3.5 w-3.5" />
    </button>
  )
}

export { RemoveButton as ResourceRemoveButton }

export function ResourceRow({
  icon,
  label,
  filled,
  expanded,
  summary,
  count,
  closeLabel = "Done",
  onToggle,
  onClear,
  clearLabel = "Remove",
  children,
}: {
  icon: ReactNode
  label: string
  filled: boolean
  expanded: boolean
  /** Text shown on a filled, collapsed row. */
  summary?: string
  /** Multi-value rows show a count instead of a summary. */
  count?: string
  closeLabel?: string
  onToggle: () => void
  onClear?: () => void
  clearLabel?: string
  children?: ReactNode
}) {
  let action: ReactNode
  if (expanded) {
    action = (
      <button
        type="button"
        onClick={onToggle}
        className="text-[13px] text-foreground-tertiary transition-colors hover:text-foreground"
      >
        {closeLabel}
      </button>
    )
  } else if (!filled) {
    action = (
      <button
        type="button"
        onClick={onToggle}
        className="text-[13px] font-medium text-primary transition-colors hover:text-primary-hover"
      >
        + Add
      </button>
    )
  } else if (count != null) {
    action = (
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 text-[13px] text-foreground-secondary tabular-nums transition-colors hover:text-foreground"
      >
        <span>{count}</span>
        <span className="text-foreground-tertiary" aria-hidden>
          ›
        </span>
      </button>
    )
  } else {
    action = (
      <>
        <button
          type="button"
          onClick={onToggle}
          title={summary}
          className="min-w-0 max-w-[220px] truncate text-right text-[13px] text-foreground-secondary transition-colors hover:text-foreground"
        >
          {summary}
        </button>
        {onClear ? <RemoveButton label={clearLabel} onClick={onClear} /> : null}
      </>
    )
  }

  return (
    <div className={`border-t border-border first:border-t-0 ${expanded ? "bg-background-layout" : ""}`}>
      <div className="flex min-h-7 items-center gap-2.5 px-3 py-2.5">
        <ResourceIcon>{icon}</ResourceIcon>
        <span className="min-w-0 flex-1 text-sm text-foreground">{label}</span>
        {action}
      </div>
      {expanded && children ? <div className="flex flex-col gap-2 px-3 pb-3">{children}</div> : null}
    </div>
  )
}

export function ResourceDropzone({
  label = "Click or drag and drop to upload a file",
  accept = RESOURCE_FILE_ACCEPT,
  multiple,
  uploading = false,
  disabled = false,
  onFiles,
}: {
  label?: string
  accept?: string
  multiple?: boolean
  uploading?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
}) {
  return (
    <FileDropzone
      onFilesSelected={onFiles}
      accept={accept}
      multiple={multiple}
      disabled={disabled || uploading}
      className="box-border block w-full rounded-lg border border-dashed border-foreground-quaternary p-3.5 text-center text-xs text-foreground hover:bg-fill"
    >
      <span>{uploading ? "Uploading…" : label}</span>
    </FileDropzone>
  )
}

/** Link input that commits on Enter or blur, then clears. */
export function ResourceLinkInput({
  placeholder = "Or paste a link",
  onCommit,
  ariaLabel,
  autoFocus,
}: {
  placeholder?: string
  onCommit: (url: string) => void
  ariaLabel?: string
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState("")

  function commit() {
    const next = draft.trim()
    if (!next) return
    setDraft("")
    onCommit(next)
  }

  return (
    <input
      type="url"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        }
      }}
      onBlur={commit}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      autoFocus={autoFocus}
      className={resourceInputClass}
    />
  )
}

/**
 * Upload box + paste-a-link input for one resource. Files upload immediately to
 * meet storage; either path hands the resulting URL to `onAdd`.
 */
export function ResourceFileOrLink({
  accept = RESOURCE_FILE_ACCEPT,
  dropLabel,
  linkPlaceholder,
  showDrop = true,
  onAdd,
  onUploaded,
  onUploadingChange,
}: {
  accept?: string
  dropLabel?: string
  linkPlaceholder?: string
  showDrop?: boolean
  onAdd: (url: string) => void
  onUploaded?: (url: string) => void
  onUploadingChange?: (uploading: boolean) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onUploadingChangeRef = useRef(onUploadingChange)

  useDontReloadWhileBusy(uploading)

  useEffect(() => {
    onUploadingChangeRef.current = onUploadingChange
  }, [onUploadingChange])

  useEffect(() => {
    onUploadingChangeRef.current?.(uploading)
  }, [uploading])

  useEffect(() => () => onUploadingChangeRef.current?.(false), [])

  async function handleFiles(files: File[]) {
    const file = files[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadMeetResourceFile(file)
      onUploaded?.(url)
      onAdd(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {showDrop ? (
        <ResourceDropzone label={dropLabel} accept={accept} uploading={uploading} onFiles={handleFiles} />
      ) : null}
      <ResourceLinkInput placeholder={linkPlaceholder} onCommit={onAdd} />
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </>
  )
}
