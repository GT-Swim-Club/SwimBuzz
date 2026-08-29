"use client"

import {
  useCallback,
  useRef,
  useState,
  useTransition,
  type ComponentType,
} from "react"
import { useSession } from "next-auth/react"
import EasyCropper, { type Area } from "react-easy-crop"
import Modal, { ModalFooter } from "@/components/Modal"
import { FileDropzone } from "@/components/FileDropzone"
import { removeProfileAvatar, uploadProfileAvatar } from "./ProfilePictureSettings.actions"

// react-easy-crop is a class component; React 19's JSX types need this cast.
const Cropper = EasyCropper as unknown as ComponentType<{
  image: string
  crop: { x: number; y: number }
  zoom: number
  aspect: number
  cropShape?: "rect" | "round"
  showGrid?: boolean
  onCropChange: (location: { x: number; y: number }) => void
  onZoomChange: (zoom: number) => void
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void
}>

const AVATAR_MAX_EDGE = 192
const AVATAR_JPEG_QUALITY = 0.82

function initialsFromName(name?: string | null, email?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  const local = (email ?? "").split("@")[0]
  return (local.slice(0, 2) || "?").toUpperCase()
}

function isHeicFile(file: File) {
  const type = (file.type || "").toLowerCase()
  if (type === "image/heic" || type === "image/heif") return true
  return /\.hei[cf]$/i.test(file.name)
}

function isAllowedImageFile(file: File) {
  if (isHeicFile(file)) return true
  if (file.type.startsWith("image/")) return true
  // Some browsers leave type empty for camera roll exports.
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name)
}

/** Convert HEIC/HEIF to JPEG — most browsers cannot decode HEIC in canvas. */
async function heicToJpegBlob(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: AVATAR_JPEG_QUALITY,
  })
  const blob = Array.isArray(result) ? result[0] : result
  if (!blob) throw new Error("Could not convert HEIC image")
  return blob
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", () => reject(new Error("Could not load image")))
    image.src = src
  })
}

/** Crop to a square JPEG sized for avatar storage. */
async function cropAvatar(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_MAX_EDGE
  canvas.height = AVATAR_MAX_EDGE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not process image")

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    AVATAR_MAX_EDGE,
    AVATAR_MAX_EDGE
  )

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", AVATAR_JPEG_QUALITY)
  )
  if (!blob) throw new Error("Could not compress image")
  return blob
}

export default function ProfilePictureSettings({
  initialImage,
  name,
  email,
  canEdit = true,
}: {
  initialImage?: string | null
  name?: string | null
  email?: string | null
  canEdit?: boolean
}) {
  const { update } = useSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState(initialImage ?? null)
  const [isPending, startTransition] = useTransition()
  const loading = isPending
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const initials = initialsFromName(name, email)

  const closeCropper = useCallback(() => {
    setCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }, [])

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (!isAllowedImageFile(file)) {
      setError("Choose an image file (JPEG, PNG, WebP, or HEIC)")
      return
    }

    setPreparing(true)
    setError(null)

    try {
      const source = isHeicFile(file) ? await heicToJpegBlob(file) : file
      const url = URL.createObjectURL(source)
      setCropSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
    } catch {
      setError(
        isHeicFile(file)
          ? "Could not convert that HEIC photo. Try exporting as JPEG."
          : "Something went wrong"
      )
    } finally {
      setPreparing(false)
    }
  }

  function saveCroppedPhoto() {
    if (!cropSrc || !croppedAreaPixels) return

    setError(null)
    startTransition(async () => {
      try {
        const compressed = await cropAvatar(cropSrc, croppedAreaPixels)
        const formData = new FormData()
        formData.append("file", compressed, "avatar.jpg")

        const data = await uploadProfileAvatar(formData)
        setImage(data.image ?? null)
        closeCropper()
        await update()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    })
  }

  function removePhoto() {
    setError(null)
    startTransition(async () => {
      try {
        await removeProfileAvatar()
        setImage(null)
        await update()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    })
  }

  const busy = loading || preparing

return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">
          Profile picture
        </p>
        {canEdit && error ? (
          <p className="mt-1 text-xs text-error">{error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <FileDropzone
          onFilesSelected={(files) => onFileChange({ target: { files: files as any } } as any)}
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,image/*"
          disabled={busy || !canEdit}
          className="flex items-center gap-2"
        >
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-sm font-medium text-primary">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span aria-hidden>{initials}</span>
            )}
          </div>

          {canEdit ? (
            <>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-secondary hover:bg-fill-secondary disabled:opacity-50"
              >
                {preparing
                  ? "Opening…"
                  : loading
                    ? "Saving…"
                    : image
                      ? "Change"
                      : "Upload"}
              </button>

              {image ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto();
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground-secondary hover:text-error disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </>
          ) : null}
        </FileDropzone>
      </div>

      {canEdit ? (
        <Modal
          open={cropSrc != null}
          onClose={() => {
            if (!loading) closeCropper()
          }}
          closeDisabled={loading}
          title="Crop photo"
          description="Drag to reposition and use the slider to zoom."
          maxWidth="sm"
          bodyClassName="!overflow-hidden"
          footer={
            <ModalFooter>
              <button
                type="button"
                disabled={loading}
                onClick={closeCropper}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground-secondary hover:bg-fill-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !croppedAreaPixels}
                onClick={saveCroppedPhoto}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? "Saving…" : "Save"}
              </button>
            </ModalFooter>
          }
        >
          {cropSrc ? (
            <div className="space-y-4">
              <div className="relative h-72 overflow-hidden rounded-xl bg-zinc-950">
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div>
                <label
                  htmlFor="avatar-zoom"
                  className="mb-1.5 block text-xs font-medium text-foreground-secondary"
                >
                  Zoom
                </label>
                <input
                  id="avatar-zoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              {error ? (
                <p className="text-xs text-error">{error}</p>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}
