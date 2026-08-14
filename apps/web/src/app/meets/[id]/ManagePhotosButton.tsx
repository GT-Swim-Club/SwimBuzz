"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { useUnsavedUploads } from "@/lib/unsaved-uploads"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/FileDropzone"

type Photo = { url: string; name: string }

type PhotosForm = {
  photos: Photo[]
  previews: string[]
}

export default function ManagePhotosButton({
  meetId,
  initial,
}: {
  meetId: string
  initial: PhotosForm
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<PhotosForm>(initial)
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)
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

  async function handlePreviewFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    const selectedFiles = Array.from(files)
    const currentCount = form.previews.length
    const maxAllowed = 20 - currentCount

    if (maxAllowed <= 0) {
      setPreviewsError("You can upload a maximum of 20 gallery photos")
      return
    }

    const filesToUpload = selectedFiles.slice(0, maxAllowed)
    if (selectedFiles.length > maxAllowed) {
      setPreviewsError(`Only the first ${maxAllowed} image(s) will be uploaded to stay within the limit of 20.`)
    } else {
      setPreviewsError(null)
    }

    setPreviewsUploading(true)

    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const body = new FormData()
        body.append("file", file)
        const res = await fetch("/api/meets/upload", { method: "POST", body })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error ?? `Upload failed for ${file.name}`)
        }
        return data.url as string
      })

      const results = await Promise.allSettled(uploadPromises)
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
        setForm((f) => ({
          ...f,
          previews: [...f.previews, ...successfulUrls],
        }))
      }

      if (errors.length > 0) {
        setPreviewsError(`Failed uploads: ${errors.join(", ")}`)
      }
    } catch {
      setPreviewsError("An error occurred during upload.")
    } finally {
      setPreviewsUploading(false)
      e.target.value = ""
    }
  }

  async function savePhotos() {
    if (previewsUploading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/meets/${meetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos: {
            links: form.photos,
            previews: form.previews,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save photos")
        return
      }
      release(form.previews)
      setOpen(false)
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void savePhotos()
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
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {hasPhotos ? "Edit Photos" : "Add Photos"}
      </button>

      <Modal
        open={open}
        maxWidth="xl"
        onClose={closeWithoutSaving}
        closeDisabled={blocked}
        busy={loading}
        title={hasPhotos ? "Edit Photos" : "Add Photos"}
        description="Add links to external photo albums or upload photos for the gallery."
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeWithoutSaving}
              disabled={blocked}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
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
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground-secondary">
            Photo Albums
          </label>
          {form.photos.map((photo, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={photo.name}
                onChange={(e) => {
                  const newPhotos = [...form.photos]
                  newPhotos[index].name = e.target.value
                  setForm((f) => ({ ...f, photos: newPhotos }))
                }}
                placeholder="Name"
                className="w-1/3 rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
              <input
                type="url"
                value={photo.url}
                onChange={(e) => {
                  const newPhotos = [...form.photos]
                  newPhotos[index].url = e.target.value
                  setForm((f) => ({ ...f, photos: newPhotos }))
                }}
                placeholder="URL"
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({
                    ...f,
                    photos: f.photos.filter((_, i) => i !== index),
                  }))
                }}
                className="text-foreground-tertiary hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))}
          {form.photos.length < 15 && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({
                    ...f,
                    photos: [...f.photos, { url: "", name: "" }],
                  }))
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium bg-background hover:bg-fill transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Photo Album
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3 mt-4 border-t border-border pt-4">
          <div>
            <label className="text-xs font-medium text-foreground-secondary">
              Gallery Photos
            </label>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2">
              Upload up to 20 photos to show in the meet gallery.
            </p>
          </div>

          {form.previews.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {form.previews.map((url, index) => (
                <div
                  key={url}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border group bg-fill-secondary cursor-grab active:cursor-grabbing"
                >
                  <img
                    src={url}
                    alt={`Preview ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePreview(index)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    title="Remove photo"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {form.previews.length < 20 && (
            <div>
              <FileDropzone
                onFilesSelected={(files) => handlePreviewFileSelect({ target: { files: files as any } } as any)}
                accept="image/*"
                multiple={true}
                disabled={previewsUploading}
                className={fileDropzoneSurfaceClassName(false, previewsUploading)}
              >
                <FileDropzoneContent
                  emptyLabel="Click or drag and drop to add gallery photos"
                  uploading={previewsUploading}
                />
              </FileDropzone>
            </div>
          )}

          {previewsError && (
            <p className="text-xs text-red-500 mt-1">{previewsError}</p>
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}
