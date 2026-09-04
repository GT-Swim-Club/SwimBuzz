"use client"

import {
  useCallback,
  useState,
  type ComponentType,
} from "react"
import EasyCropper, { type Area } from "react-easy-crop"
import Modal, { ModalFooter } from "@/components/ui/Modal"

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

const BANNER_MAX_WIDTH = 800
const BANNER_JPEG_QUALITY = 0.85

/** Load image for canvas processing */
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", () => reject(new Error("Could not load image")))
    image.src = src
  })
}

/** Crop to a 2/1 JPEG sized for banner storage. */
async function cropBanner(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement("canvas")
  
  // Enforce 2/1 aspect ratio
  const targetWidth = BANNER_MAX_WIDTH
  const targetHeight = BANNER_MAX_WIDTH / 2                
  canvas.width = targetWidth
  canvas.height = targetHeight
  
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
    targetWidth,
    targetHeight
  )

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", BANNER_JPEG_QUALITY)
  )
  if (!blob) throw new Error("Could not compress image")
  return blob
}

export default function BannerCropper({
  imageSrc,
  isOpen,
  onClose,
  onSave,
}: {
  imageSrc: string | null
  isOpen: boolean
  onClose: () => void
  onSave: (blob: Blob) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return

    setLoading(true)
    setError(null)
    try {
      const compressed = await cropBanner(imageSrc, croppedAreaPixels)
      onSave(compressed)
      onClose()
    } catch {
      setError("Failed to crop image")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      closeDisabled={loading}
      title="Crop banner"
      description="Drag to reposition and use the slider to zoom."
      maxWidth="md"
      bodyClassName="!overflow-hidden"
      footer={
        <ModalFooter>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground-secondary hover:bg-fill-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !croppedAreaPixels}
            onClick={handleSave}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </ModalFooter>
      }
    >
      {imageSrc ? (
        <div className="space-y-4">
          <div className="relative h-64 overflow-hidden rounded-xl bg-zinc-950">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={2}
              cropShape="rect"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div>
            <label
              htmlFor="banner-zoom"
              className="mb-1.5 block text-xs font-medium text-foreground-secondary"
            >
              Zoom
            </label>
            <input
              id="banner-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          {error ? <p className="text-xs text-error">{error}</p> : null}
        </div>
      ) : null}
    </Modal>
  )
}
