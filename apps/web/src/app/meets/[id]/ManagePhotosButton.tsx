"use client"

import type { ReactNode } from "react"
import { useEffect, useState, useTransition } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { useUnsavedUploads } from "@/lib/meet/unsaved-uploads"
import { AppIcon } from "@/components/ui/AppIcon"
import {
  ResourceDropzone,
  ResourceList,
  ResourceModalHeader,
  ResourceRemoveButton,
  ResourceRow,
  resourceInputClass,
  uploadMeetResourceFile,
} from "@/components/meet/ResourceRows"
import { updateMeet } from "./meet-update.actions"

type Photo = { url: string; name: string }

const MAX_ALBUMS = 15
const MAX_PREVIEWS = 20

type PhotosForm = {
  photos: Photo[]
  previews: string[]
}

export default function ManagePhotosButton({
  meetId,
  initial,
  trigger,
}: {
  meetId: string
  initial: PhotosForm
  /** Custom trigger; receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const loading = isPending
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<PhotosForm>(initial)
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<"albums" | "gallery" | null>(null)
  const [previewsUploading, setPreviewsUploading] = useState(false)
  const [previewsError, setPreviewsError] = useState<string | null>(null)
  const { begin, trackUpload, release } = useUnsavedUploads()
  const blocked = loading || previewsUploading

  useDontReloadWhileBusy(loading || previewsUploading)

  const hasPhotos = initial.photos.length > 0 || initial.previews.length > 0

  function closeWithoutSaving() {
    if (blocked) return
    release(initial.previews)
    setOpen(false)
  }

  useEffect(() => {
    if (open) {
      setForm(initial)
      setExpanded(null)
      setError(null)
      setPreviewsError(null)
    }
  }, [open, initial])

  function handleRemovePreview(index: number) {
    setForm((f) => ({
      ...f,
      previews: f.previews.filter((_, i) => i !== index),
    }))
  }

  const handleDragStart = (index: number) => {
    setDraggedItemIndex(index)
  }

  const handleDragEnter = (index: number) => {
    if (draggedItemIndex === null || draggedItemIndex === index) return
    const newPreviews = [...form.previews]
    const draggedItem = newPreviews[draggedItemIndex]
    newPreviews.splice(draggedItemIndex, 1)
    newPreviews.splice(index, 0, draggedItem)
    setForm((f) => ({ ...f, previews: newPreviews }))
    setDraggedItemIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedItemIndex(null)
  }

  async function handlePreviewFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"))
    if (images.length === 0) return

    const maxAllowed = MAX_PREVIEWS - form.previews.length
    if (maxAllowed <= 0) {
      setPreviewsError(`You can upload a maximum of ${MAX_PREVIEWS} gallery photos.`)
      return
    }

    const filesToUpload = images.slice(0, maxAllowed)
    setPreviewsError(
      images.length > maxAllowed
        ? `You can upload a maximum of ${MAX_PREVIEWS} gallery photos.`
        : null
    )
    setPreviewsUploading(true)

    try {
      const results = await Promise.allSettled(filesToUpload.map(uploadMeetResourceFile))
      const successfulUrls: string[] = []
      const errors: string[] = []

      results.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          successfulUrls.push(result.value)
          trackUpload(result.value)
        } else {
          errors.push(result.reason?.message ?? `Upload failed for file ${idx + 1}`)
        }
      })

      if (successfulUrls.length > 0) {
        setForm((f) => ({ ...f, previews: [...f.previews, ...successfulUrls] }))
      }
      if (errors.length > 0) {
        setPreviewsError(`Failed uploads: ${errors.join(", ")}`)
      }
    } catch {
      setPreviewsError("An error occurred during upload.")
    } finally {
      setPreviewsUploading(false)
    }
  }

  function updateAlbum(index: number, patch: Partial<Photo>) {
    setForm((f) => ({
      ...f,
      photos: f.photos.map((photo, i) => (i === index ? { ...photo, ...patch } : photo)),
    }))
  }

  function toggleAlbums() {
    if (expanded === "albums") {
      setExpanded(null)
      setForm((f) => ({ ...f, photos: f.photos.filter((p) => p.url.trim() || p.name.trim()) }))
      return
    }
    setExpanded("albums")
    setForm((f) => (f.photos.length ? f : { ...f, photos: [{ name: "", url: "" }] }))
  }

  const albumCount = form.photos.filter((p) => p.url.trim()).length
  const previewCount = form.previews.length
  const addedCount = (albumCount > 0 ? 1 : 0) + (previewCount > 0 ? 1 : 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (previewsUploading) return
    setError(null)

    startTransition(async () => {
      try {
        const result = await updateMeet(meetId, {
          photos: {
            links: form.photos.filter((p) => p.url.trim()),
            previews: form.previews,
          },
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        release(form.previews)
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
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {hasPhotos ? "Edit Photos" : "Add Photos"}
        </button>
      )}

      <Modal
        open={open}
        onClose={closeWithoutSaving}
        closeDisabled={blocked}
        busy={loading}
        header={
          <ResourceModalHeader
            title={hasPhotos ? "Edit photos" : "Add photos"}
            count={`${addedCount} of 2 added`}
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
              {loading ? "Saving…" : previewsUploading ? "Uploading…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <ResourceList>
          <ResourceRow
            icon={<AppIcon name="link" />}
            label="Photo albums"
            filled={albumCount > 0}
            expanded={expanded === "albums"}
            summary={`${albumCount} album${albumCount === 1 ? "" : "s"}`}
            onToggle={toggleAlbums}
            onClear={() => setForm((f) => ({ ...f, photos: [] }))}
            clearLabel="Remove all"
          >
            {form.photos.map((photo, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={photo.name}
                  onChange={(e) => updateAlbum(index, { name: e.target.value })}
                  placeholder="Name"
                  aria-label="Album name"
                  className={`${resourceInputClass} !w-1/3`}
                />
                <input
                  type="url"
                  value={photo.url}
                  onChange={(e) => updateAlbum(index, { url: e.target.value })}
                  placeholder="https://photos.google.com/…"
                  aria-label="Album URL"
                  className={`${resourceInputClass} flex-1`}
                />
                <ResourceRemoveButton
                  label="Remove album"
                  onClick={() =>
                    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }))
                  }
                />
              </div>
            ))}
            {form.photos.length < MAX_ALBUMS ? (
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, photos: [...f.photos, { name: "", url: "" }] }))}
                  className="text-[13px] font-medium text-primary transition-colors hover:text-primary-hover"
                >
                  + Add another album
                </button>
              </div>
            ) : null}
          </ResourceRow>

          <ResourceRow
            icon={<AppIcon name="image" />}
            label="Gallery photos"
            filled={previewCount > 0}
            expanded={expanded === "gallery"}
            summary={`${previewCount} photo${previewCount === 1 ? "" : "s"}`}
            onToggle={() => {
              setPreviewsError(null)
              setExpanded(expanded === "gallery" ? null : "gallery")
            }}
            onClear={() => setForm((f) => ({ ...f, previews: [] }))}
            clearLabel="Remove all"
          >
            <span className="text-xs text-foreground-tertiary tabular-nums">
              {previewCount} / {MAX_PREVIEWS} · Drag to reorder.
            </span>
            {previewCount > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
                {form.previews.map((url, index) => (
                  <div
                    key={url}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragEnter={() => handleDragEnter(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                    className={`relative aspect-square cursor-grab overflow-hidden rounded-lg border border-border bg-fill-secondary transition-opacity duration-100 active:cursor-grabbing ${
                      draggedItemIndex === index ? "opacity-40" : ""
                    }`}
                  >
                    <img
                      src={url}
                      alt={`Gallery photo ${index + 1}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePreview(index)}
                      aria-label={`Remove photo ${index + 1}`}
                      title="Remove"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-error"
                    >
                      <AppIcon name="x" className="h-[11px] w-[11px]" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {previewCount < MAX_PREVIEWS ? (
              <ResourceDropzone
                label="Click or drag and drop to add gallery photos"
                accept="image/*"
                multiple
                uploading={previewsUploading}
                disabled={draggedItemIndex !== null}
                onFiles={(files) => void handlePreviewFiles(files)}
              />
            ) : null}
            {previewsError ? <p className="text-xs text-error">{previewsError}</p> : null}
          </ResourceRow>
        </ResourceList>

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}
