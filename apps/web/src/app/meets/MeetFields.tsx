"use client"

import BannerCropper from "@/components/athlete/BannerCropper"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { parseTypedDate, TimePicker, TimeZonePicker } from "@/components/ui/CustomDateTimePicker"
import { FileDropzone } from "@/components/ui/FileDropzone"
import { AppIcon } from "@/components/ui/AppIcon"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { downloadBlob } from "@/components/ui/export-menu"
import {
  DEFAULT_TIME_ZONE,
  defaultSeason,
  formatClockTime,
  formatSeasonLabel,
  meetFileName,
  zoneAbbreviation,
} from "@swimbuzz/shared"
import { useEscapeToClose } from "@/lib/use-escape-to-close"

export type MeetFormState = {
  name: string
  location: string
  startDate: string
  startTime: string
  timeZone: string
  endDate: string
  course: string
  season: string
  school: string
  iconUrl: string
  bannerUrl: string
  packetUrl: string
  psychSheetUrl: string
  heatSheetUrl: string
  resultsUrl: string
}

export const emptyMeetForm: MeetFormState = {
  name: "",
  location: "",
  startDate: "",
  startTime: "",
  timeZone: DEFAULT_TIME_ZONE,
  endDate: "",
  course: "SCY",
  season: "",
  school: "",
  iconUrl: "",
  bannerUrl: "",
  packetUrl: "",
  psychSheetUrl: "",
  heatSheetUrl: "",
  resultsUrl: "",
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
const labelClass = "mb-1 block text-xs font-medium text-foreground-secondary"

const COURSES = ["SCY", "SCM", "LCM"] as const
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]
const ICON_ACCEPT = "image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
const BANNER_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
}

/**
 * `<a download>` is ignored for cross-origin URLs (Supabase Storage), so the image is
 * fetched as a blob — directly when the host allows CORS, else via the same-origin proxy.
 */
async function fetchImageBlob(url: string) {
  try {
    const res = await fetch(url)
    if (res.ok) return await res.blob()
  } catch {
    // Fall through to the proxy.
  }
  const res = await fetch("/api/remote-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  return res.blob()
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function parseIso(value: string) {
  const [y, m, d] = value.split("-").map(Number)
  return { y, m: m - 1, d }
}

/** "Oct 3–5, 2026 · 6:00 PM EDT" */
function whenLabel(form: MeetFormState): string {
  if (!form.startDate) return ""
  const a = parseIso(form.startDate)
  let label = `${MONTHS[a.m]} ${a.d}`
  if (form.endDate && form.endDate !== form.startDate) {
    const b = parseIso(form.endDate)
    label += b.m === a.m && b.y === a.y ? `–${b.d}, ${b.y}` : ` – ${MONTHS[b.m]} ${b.d}, ${b.y}`
  } else {
    label += `, ${a.y}`
  }
  if (form.startTime) {
    const zone = zoneAbbreviation(form.timeZone || DEFAULT_TIME_ZONE, new Date(a.y, a.m, a.d, 12))
    label += ` · ${formatClockTime(form.startTime)} ${zone}`
  }
  return label
}

const PANEL_GAP = 6
const PANEL_WIDTH = 300
const VIEWPORT_MARGIN = 12

function panelWidth() {
  return Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
}

/** Vertical edge is `top` when placed below the field, `bottom` when placed above it. */
type PanelPosition = { top?: number; bottom?: number; left: number; width: number; maxHeight: number }

/**
 * Renders the date panel in a portal anchored under the "When" field, so it floats over
 * the modal instead of growing it. Nested pickers (e.g. the time picker) portal their own
 * popovers marked with `data-floating-popover`; clicks there don't count as outside clicks.
 */
function FloatingDateRangePanel({
  anchorRef,
  onClose,
  ...panelProps
}: {
  anchorRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  form: MeetFormState
  setForm: React.Dispatch<React.SetStateAction<MeetFormState>>
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  // Blur first so a half-typed date field commits before the panel unmounts.
  const close = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && panelRef.current?.contains(active)) active.blur()
    onClose()
  }, [onClose])
  useEscapeToClose(true, close)

  const reposition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const height = panelRef.current?.scrollHeight ?? 0
    const roomBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN
    const roomAbove = rect.top - PANEL_GAP - VIEWPORT_MARGIN
    const placeBelow = roomBelow >= height || roomBelow >= roomAbove
    const maxHeight = Math.max(160, placeBelow ? roomBelow : roomAbove)
    const width = panelWidth()
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN))
    // Pin the edge nearest the field so the panel hugs it regardless of its own height.
    const vertical = placeBelow
      ? { top: rect.bottom + PANEL_GAP }
      : { bottom: window.innerHeight - rect.top + PANEL_GAP }
    setPosition({ ...vertical, left, width, maxHeight })
  }, [anchorRef])

  useLayoutEffect(() => {
    reposition()
  }, [reposition])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Element
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return
      if (target.closest?.("[data-floating-popover]")) return
      close()
    }
    document.addEventListener("mousedown", onPointerDown)
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    }
  }, [anchorRef, close, reposition])

  if (typeof document === "undefined") return null
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Meet dates"
      className="fixed z-[60] overflow-y-auto rounded-xl shadow-2xl shadow-black/30"
      style={
        position
          ? {
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }
          : // Measured off-screen at its final width before the first placement.
            { top: 0, left: 0, width: panelWidth(), visibility: "hidden" }
      }
    >
      <MeetDateRangePanel {...panelProps} />
    </div>,
    document.body
  )
}

/** "Oct 3, 2026" */
function shortDate(value: string) {
  if (!value) return ""
  const { y, m, d } = parseIso(value)
  return `${MONTHS[m]} ${d}, ${y}`
}

/**
 * Free-text date field inside the range panel. Accepts the same formats as the app's
 * DatePicker ("10/3/2026", "Oct 3", "next friday"…), commits on blur or Enter, and
 * flags input the caller rejects.
 */
function TypedDateInput({
  label,
  value,
  placeholder,
  disabled = false,
  onCommit,
  onPreview,
}: {
  label: string
  value: string
  placeholder: string
  disabled?: boolean
  /** Returns false to reject the date. "" clears it. */
  onCommit: (value: string) => boolean
  /** Called while typing once the text parses, to page the calendar to it. */
  onPreview: (value: string) => void
}) {
  const [text, setText] = useState(() => shortDate(value))
  const [invalid, setInvalid] = useState(false)
  const [shownValue, setShownValue] = useState(value)
  if (value !== shownValue) {
    setShownValue(value)
    setText(shortDate(value))
    setInvalid(false)
  }

  function toIso(raw: string) {
    const parsed = parseTypedDate(raw)
    return parsed ? isoDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null
  }

  function commit() {
    const raw = text.trim()
    const next = raw ? toIso(raw) : ""
    if (next === null || !onCommit(next)) {
      setInvalid(true)
      return
    }
    setText(shortDate(next))
    setInvalid(false)
  }

  return (
    <div className="min-w-0">
      <label className={labelClass}>{label}</label>
      <input
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setInvalid(false)
          const next = toIso(e.target.value)
          if (next) onPreview(next)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className={`${inputClass} tabular-nums disabled:cursor-not-allowed disabled:opacity-50 ${
          invalid ? "!border-error focus:!ring-error/25" : ""
        }`}
      />
    </div>
  )
}

function MeetDateRangePanel({
  form,
  setForm,
}: {
  form: MeetFormState
  setForm: React.Dispatch<React.SetStateAction<MeetFormState>>
}) {
  const [view, setView] = useState<[number, number]>(() => {
    if (form.startDate) {
      const { y, m } = parseIso(form.startDate)
      return [y, m]
    }
    const now = new Date()
    return [now.getFullYear(), now.getMonth()]
  })
  const [year, month] = view
  const leading = new Date(year, month, 1).getDay()
  // Always six weeks, so the panel keeps one height while paging through months.
  const days = Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - leading + i))
  const title = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })

  function showMonthOf(value: string) {
    const { y, m } = parseIso(value)
    setView([y, m])
  }

  // First click sets the start; a later click sets the end. Clicking again after a full
  // range (or on/before the start) starts over as a single day.
  function pick(value: string) {
    setForm((f) => {
      if (!f.startDate || f.endDate || value <= f.startDate) return { ...f, startDate: value, endDate: "" }
      return { ...f, endDate: value }
    })
  }

  function commitStart(value: string) {
    setForm((f) => ({ ...f, startDate: value, endDate: value && f.endDate > value ? f.endDate : "" }))
    if (value) showMonthOf(value)
    return true
  }

  function commitEnd(value: string) {
    if (value && value < form.startDate) return false
    setForm((f) => ({ ...f, endDate: value === f.startDate ? "" : value }))
    if (value) showMonthOf(value)
    return true
  }

  const navClass =
    "flex h-7 w-7 items-center justify-center rounded-lg text-foreground-secondary transition-colors hover:bg-fill"

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background-layout p-3.5">
      <div className="grid grid-cols-2 gap-3">
        <TypedDateInput
          label="Start date"
          value={form.startDate}
          placeholder="MM/DD/YYYY"
          onCommit={commitStart}
          onPreview={showMonthOf}
        />
        <TypedDateInput
          label="End date"
          value={form.endDate}
          placeholder={form.startDate ? "Same day" : "MM/DD/YYYY"}
          disabled={!form.startDate}
          onCommit={commitEnd}
          onPreview={showMonthOf}
        />
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setView(month === 0 ? [year - 1, 11] : [year, month - 1])}
          className={navClass}
        >
          <AppIcon name="chevronLeft" className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setView(month === 11 ? [year + 1, 0] : [year, month + 1])}
          className={navClass}
        >
          <AppIcon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs tabular-nums">
        {WEEKDAYS.map((day, i) => (
          <span key={i} className="py-0.5 text-foreground-tertiary">
            {day}
          </span>
        ))}
        {days.map((day) => {
          const value = isoDate(day.getFullYear(), day.getMonth(), day.getDate())
          const isEnd = value === form.startDate || value === form.endDate
          const inRange =
            Boolean(form.startDate && form.endDate) && value > form.startDate && value < form.endDate
          const outsideMonth = day.getMonth() !== month
          return (
            <button
              type="button"
              key={value}
              onClick={() => pick(value)}
              aria-pressed={isEnd}
              aria-label={day.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              className={`aspect-square rounded-md text-xs transition-colors ${
                isEnd
                  ? "bg-primary font-semibold text-primary-contrast"
                  : inRange
                    ? "bg-primary/20 text-foreground"
                    : outsideMonth
                      ? "text-foreground-quaternary hover:bg-fill"
                      : "text-foreground hover:bg-fill"
              }`}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First session</label>
          <TimePicker
            value={form.startTime}
            onChange={(value) => setForm((f) => ({ ...f, startTime: value }))}
            ariaLabel="First session time"
            placeholder="Add time"
          />
        </div>
        <div>
          <label className={labelClass}>Time zone</label>
          <TimeZonePicker
            value={form.timeZone}
            onChange={(value) => setForm((f) => ({ ...f, timeZone: value }))}
            ariaLabel="Meet time zone"
            date={form.startDate}
            compact
          />
        </div>
      </div>
    </div>
  )
}

/** Banner + overlapping icon tile at the top of the create/edit meet dialog. */
export function MeetImageHeader({
  title,
  form,
  setForm,
  onUploaded,
  onError,
  onUploadingChange,
}: {
  title: string
  form: MeetFormState
  setForm: React.Dispatch<React.SetStateAction<MeetFormState>>
  onUploaded?: (url: string) => void
  onError: (message: string | null) => void
  onUploadingChange?: (uploading: boolean) => void
}) {
  const [iconUploading, setIconUploading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerCroppingSrc, setBannerCroppingSrc] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<"icon" | "banner" | null>(null)
  const uploading = iconUploading || bannerUploading

  async function downloadImage(kind: "icon" | "banner", url: string) {
    setDownloading(kind)
    onError(null)
    try {
      const blob = await fetchImageBlob(url)
      const ext = IMAGE_EXT[blob.type] ?? (kind === "banner" ? "jpg" : "png")
      downloadBlob(blob, meetFileName(kind === "icon" ? "Icon" : "Banner", form.name, ext))
    } catch {
      onError(`Could not download the ${kind}`)
    } finally {
      setDownloading(null)
    }
  }

  useDontReloadWhileBusy(uploading)

  useEffect(() => {
    onUploadingChange?.(uploading)
  }, [uploading, onUploadingChange])

  async function uploadImage(endpoint: string, file: Blob, name?: string) {
    const formData = new FormData()
    if (name) formData.append("file", file, name)
    else formData.append("file", file)
    // Vercel rejects request bodies over ~4.5MB with a non-JSON page.
    if (file.size > 4 * 1024 * 1024) throw new Error("Image must be 4 MB or smaller")
    const res = await fetch(endpoint, { method: "POST", body: formData })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.url) {
      throw new Error(data?.error ?? `Upload failed (${res.status})`)
    }
    return data.url as string
  }

  async function handleIconFiles(files: File[]) {
    const file = files[0]
    if (!file) return
    setIconUploading(true)
    onError(null)
    try {
      const url = await uploadImage("/api/meets/icon", file)
      setForm((f) => ({ ...f, iconUrl: url }))
      onUploaded?.(url)
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIconUploading(false)
    }
  }

  function handleBannerFiles(files: File[]) {
    const file = files[0]
    if (!file) return
    onError(null)
    setBannerCroppingSrc(URL.createObjectURL(file))
  }

  function closeCropper() {
    if (bannerCroppingSrc) URL.revokeObjectURL(bannerCroppingSrc)
    setBannerCroppingSrc(null)
  }

  async function onBannerCropped(blob: Blob) {
    setBannerUploading(true)
    onError(null)
    try {
      const url = await uploadImage("/api/meets/banner", blob, "banner.jpg")
      setForm((f) => ({ ...f, bannerUrl: url }))
      onUploaded?.(url)
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBannerUploading(false)
      closeCropper()
    }
  }

  return (
    <div className="relative aspect-[2/1] shrink-0 border-b border-border">
      {/* 2:1 like BannerCropper, so the preview shows the whole uploaded banner. */}
      <h2 className="sr-only">{title}</h2>
      <FileDropzone
        onFilesSelected={handleBannerFiles}
        accept={BANNER_ACCEPT}
        disabled={bannerUploading}
        className={`group !absolute inset-0 overflow-hidden rounded-t-2xl bg-background ${
          form.bannerUrl ? "" : "border border-dashed border-foreground-quaternary"
        }`}
      >
        {form.bannerUrl ? (
          <>
            <img src={form.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div
              className={`absolute inset-0 flex items-center justify-center gap-2 bg-black/45 transition-opacity ${
                bannerUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-contrast transition-colors hover:bg-primary-hover">
                  {bannerUploading ? "Uploading…" : "Click or drop to replace"}
                </span>
                {!bannerUploading ? (
                  <>
                    <button
                      type="button"
                      aria-label="Download banner"
                      disabled={downloading === "banner"}
                      onClick={(e) => {
                        e.stopPropagation()
                        void downloadImage("banner", form.bannerUrl)
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill disabled:opacity-60"
                    >
                      <AppIcon name="download" className="h-4 w-4" />
                      <HoverDetail label="Download banner" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove banner"
                      onClick={(e) => {
                        e.stopPropagation()
                        setForm((f) => ({ ...f, bannerUrl: "" }))
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-error-border bg-background text-error transition-colors hover:bg-error-bg"
                    >
                      <ActionIcon kind="delete" className="h-4 w-4" />
                      <HoverDetail label="Remove banner" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3.5 text-center text-xs text-foreground">
            {bannerUploading ? "Uploading…" : "Click or drag and drop to upload a banner"}
          </div>
        )}
      </FileDropzone>

      <div className="absolute -bottom-[30px] left-6 z-[2] h-[68px] w-[68px] overflow-hidden rounded-xl border-[3px] border-background bg-fill">
        <FileDropzone
          onFilesSelected={(files) => void handleIconFiles(files)}
          accept={ICON_ACCEPT}
          disabled={iconUploading}
          className="group !absolute inset-0"
        >
          {form.iconUrl ? (
            <img src={form.iconUrl} alt="Meet icon" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center rounded-[9px] border border-dashed border-foreground-quaternary bg-background text-xs font-medium text-primary transition-colors group-hover:border-primary/60">
              {iconUploading ? "…" : "+ Icon"}
            </div>
          )}
        </FileDropzone>
        {form.iconUrl ? (
          <button
            type="button"
            aria-label="Remove icon"
            onClick={() => setForm((f) => ({ ...f, iconUrl: "" }))}
            className="absolute right-0.5 top-0.5 z-[1] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-fill"
          >
            <AppIcon name="x" className="h-2.5 w-2.5" strokeWidth={2.5} />
            <HoverDetail label="Remove icon" />
          </button>
        ) : null}
        {form.iconUrl ? (
          <button
            type="button"
            aria-label="Download icon"
            disabled={downloading === "icon"}
            onClick={() => void downloadImage("icon", form.iconUrl)}
            className="absolute bottom-0.5 right-0.5 z-[1] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-fill disabled:opacity-60"
          >
            <AppIcon name="download" className="h-2.5 w-2.5" strokeWidth={2.5} />
            <HoverDetail label="Download icon" />
          </button>
        ) : null}
      </div>

      <BannerCropper
        imageSrc={bannerCroppingSrc}
        isOpen={bannerCroppingSrc !== null}
        onClose={closeCropper}
        onSave={onBannerCropped}
      />
    </div>
  )
}

export default function MeetFields({
  form,
  setForm,
  initialSeasons,
}: {
  form: MeetFormState
  setForm: React.Dispatch<React.SetStateAction<MeetFormState>>
  initialSeasons?: string[]
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const whenButtonRef = useRef<HTMLButtonElement>(null)
  const closeCalendar = useCallback(() => setCalendarOpen(false), [])
  const [fetchedSeasons, setFetchedSeasons] = useState<string[]>(initialSeasons ?? [])

  useEffect(() => {
    if (!initialSeasons) {
      fetch("/api/seasons")
        .then((res) => {
          if (!res.ok) return []
          return res.json().catch(() => [])
        })
        .then((data) => {
          setFetchedSeasons(Array.isArray(data) ? data : [])
        })
        .catch(() => setFetchedSeasons([]))
    }
  }, [initialSeasons])

  useEffect(() => {
    if (fetchedSeasons.length > 0 && !form.season) {
      setForm((f) => ({ ...f, season: defaultSeason(fetchedSeasons) ?? "" }))
    }
  }, [fetchedSeasons, form.season, setForm])

  const options = Array.from(new Set([...fetchedSeasons]))

  const set = <K extends keyof MeetFormState>(key: K, value: MeetFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const when = whenLabel(form)

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <label className={labelClass}>
          Meet name <span className="text-error">*</span>
        </label>
        <input
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Sting 'Em Classic"
          className={`${inputClass} !text-base font-semibold`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className={labelClass}>Location</label>
          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="McAuley Aquatic Center"
            className={inputClass}
          />
        </div>
        <div className="min-w-0">
          <label className={labelClass}>School</label>
          <input
            value={form.school}
            onChange={(e) => set("school", e.target.value)}
            placeholder="Georgia Tech"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          When <span className="text-error">*</span>
        </label>
        <button
          ref={whenButtonRef}
          type="button"
          onClick={() => setCalendarOpen((o) => !o)}
          aria-expanded={calendarOpen}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm transition-[border-color,box-shadow] ${
            calendarOpen ? "border-primary ring-[3px] ring-primary/35" : "border-border"
          }`}
        >
          <span className={`truncate tabular-nums ${when ? "text-foreground" : "text-foreground-tertiary"}`}>
            {when || "Choose dates"}
          </span>
          <AppIcon
            name="chevronDown"
            className={`h-4 w-4 shrink-0 text-foreground-tertiary transition-transform duration-200 ${
              calendarOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {calendarOpen ? (
          <FloatingDateRangePanel
            anchorRef={whenButtonRef}
            form={form}
            setForm={setForm}
            onClose={closeCalendar}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className={labelClass}>
            Course <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              required
              aria-label="Course"
              value={form.course}
              onChange={(e) => set("course", e.target.value)}
              className={`${inputClass} appearance-none pr-9`}
            >
              {COURSES.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
            <AppIcon
              name="chevronDown"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-tertiary"
            />
          </div>
        </div>
        <div className="min-w-0">
          <label className={labelClass}>
            Season <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              required
              value={form.season}
              onChange={(e) => set("season", e.target.value)}
              className={`${inputClass} appearance-none pr-9`}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {formatSeasonLabel(s)}
                </option>
              ))}
            </select>
            <AppIcon
              name="chevronDown"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-tertiary"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
