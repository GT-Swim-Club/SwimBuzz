"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { isStoredMeetFileUrl } from "@/lib/meet-files"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { FileDropzone } from "@/components/FileDropzone"

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
}: {
  label: string
  icon: ReactNode
  value: string
  onChange: (url: string) => void
  onUploadingChange?: (uploading: boolean) => void
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

  async function deleteStoredFile(url: string) {
    if (!isStoredMeetFileUrl(url)) return
    await fetch("/api/meets/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
  }

  async function switchToUrl() {
    setUploadError(null)
    if (fileValue) {
      try {
        await deleteStoredFile(fileValue)
      } catch {
        setUploadError("Failed to delete file")
        return
      }
      setFileValue("")
    }
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

  async function handleRemoveFile() {
    if (!fileValue || uploading) return
    setUploadError(null)
    try {
      await deleteStoredFile(fileValue)
      setFileValue("")
      if (mode === "file") onChange("")
    } catch {
      setUploadError("Failed to remove file")
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      if (fileValue) await deleteStoredFile(fileValue)

      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/meets/upload", { method: "POST", body })
      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed")
        return
      }
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
            className="block w-full rounded-lg border border-border border-dashed p-4 text-center text-xs text-foreground cursor-pointer hover:bg-fill-secondary"
          >
            {uploading ? "Uploading..." : "Click or drag and drop to upload file"}
          </FileDropzone>
          {fileValue && !uploading && (
            <div className="flex items-center gap-2">
              {fileName && (
                <p className="text-xs text-foreground-secondary text-foreground-secondary truncate">
                  Uploaded: {fileName}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleRemoveFile()}
                className="text-foreground-tertiary hover:text-red-500"
                aria-label="Remove file"
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
          )}
        </div>
      )}

      {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
    </div>
  )
}
