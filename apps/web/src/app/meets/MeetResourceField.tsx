"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { isStoredMeetFileUrl } from "@/lib/meet/meet-files"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/ui/FileDropzone"

const inputClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"

function initialMode(value: string): "url" | "file" {
  if (value && !isStoredMeetFileUrl(value)) return "url"
  return "file"
}

export default function MeetResourceField({
  label,
  icon,
  value,
  onChange,
  onUploadingChange,
  onUploaded,
  bodyLeading,
}: {
  label: string
  icon: ReactNode
  value: string
  onChange: (url: string) => void
  onUploadingChange?: (uploading: boolean) => void
  onUploaded?: (url: string) => void
  bodyLeading?: ReactNode
}) {
  const [mode, setMode] = useState<"url" | "file">(() => initialMode(value))
  const [urlValue, setUrlValue] = useState(() =>
    value && isStoredMeetFileUrl(value) ? "" : (value ?? "")
  )
  const [fileValue, setFileValue] = useState(() =>
    value && isStoredMeetFileUrl(value) ? value : ""
  )
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useDontReloadWhileBusy(uploading)

  const onUploadingChangeRef = useRef(onUploadingChange)
  onUploadingChangeRef.current = onUploadingChange

  useEffect(() => {
    onUploadingChangeRef.current?.(uploading)
  }, [uploading])

  useEffect(() => {
    return () => onUploadingChangeRef.current?.(false)
  }, [])

  // Sync when the parent form resets (e.g. opening the edit modal).
  useEffect(() => {
    const active = mode === "url" ? urlValue : fileValue
    if (value === active) return

    if (isStoredMeetFileUrl(value)) {
      setFileValue(value)
      setMode("file")
    } else {
      setUrlValue(value ?? "")
      setMode("url")
    }
  }, [value, mode, urlValue, fileValue])

  function switchToUrl() {
    setUploadError(null)
    setMode("url")
    onChange(urlValue)
  }

  function switchToFile() {
    setUploadError(null)
    setMode("file")
    onChange(fileValue)
  }

  function updateUrl(next: string) {
    setUrlValue(next)
    if (mode === "url") onChange(next)
  }

  function updateFile(next: string) {
    setFileValue(next)
    if (mode === "file") onChange(next)
  }

  function handleRemoveFile() {
    if (!fileValue || uploading) return
    setUploadError(null)
    setFileValue("")
    if (mode === "file") onChange("")
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/meets/upload", { method: "POST", body })
      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed")
        return
      }
      onUploaded?.(data.url)
      updateFile(data.url)
    } catch {
      setUploadError("Upload failed")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const fileName = fileValue
    ? fileValue.startsWith("/meet-files/")
      ? fileValue.split("/").pop()
      : decodeURIComponent(fileValue.split("/").pop() ?? "")
    : null

  return (
    <div>
      <div className="flex items-center gap-4 mb-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary text-foreground-secondary">
          {icon}
          {label}
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={switchToFile}
            disabled={uploading}
            className={
              "text-xs px-2 py-0.5 rounded-md border border-border transition-colors " +
              (mode === "file"
                ? "bg-primary text-primary-text border-primary"
                : "border-border text-foreground-secondary hover:bg-fill-secondary")
            }
          >
            File
          </button>
          <button
            type="button"
            onClick={() => void switchToUrl()}
            disabled={uploading}
            className={
              "text-xs px-2 py-0.5 rounded-md border border-border transition-colors " +
              (mode === "url"
                ? "bg-primary text-primary-text border-primary"
                : "border-border text-foreground-secondary hover:bg-fill-secondary")
            }
          >
            URL
          </button>
        </div>
      </div>

      <div className={bodyLeading ? "flex items-stretch gap-2" : undefined}>
        {bodyLeading ? <div className="flex w-32 shrink-0">{bodyLeading}</div> : null}
        <div className={bodyLeading ? "min-w-0 flex-1" : undefined}>
        {mode === "url" ? (
        <input
          key="url"
          value={urlValue}
          onChange={(e) => updateUrl(e.target.value)}
          placeholder="https://…"
          className={inputClass}
        />
      ) : (
        <div key="file" className="space-y-2">
          <FileDropzone
            onFilesSelected={(files) => handleFileSelect({ target: { files: files as any } } as any)}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            disabled={uploading}
            className={fileDropzoneSurfaceClassName(Boolean(fileValue), uploading)}
          >
            <FileDropzoneContent
              fileName={fileName}
              emptyLabel="Click or drag and drop to upload a file"
              uploading={uploading}
              onRemove={handleRemoveFile}
            />
          </FileDropzone>
        </div>
        )}
        </div>
      </div>

      {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
    </div>
  )
}
