"use client"

import BannerCropper from "@/components/BannerCropper"
import { useEffect, useState } from "react"
import { currentSeason, seasonOptions, upcomingSeason } from "@/lib/season"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import Modal, { ModalFooter } from "@/components/Modal"
import { DatePicker, TimePicker } from "@/components/CustomDateTimePicker"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/FileDropzone"
import { useSession } from "next-auth/react"
import { isStaffRole } from "@/lib/auth-roles"
import { useViewerTimeZone } from "@/components/ZonedTime"
import { DEFAULT_TIME_ZONE, zoneAbbreviation, zoneDisplayName } from "@swimbuzz/shared"

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
  "w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
const labelClass =
  "block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1"

export default function MeetFields({
  form,
  setForm,
  initialSeasons,
  onUploaded,
}: {
  form: MeetFormState
  setForm: React.Dispatch<React.SetStateAction<MeetFormState>>
  initialSeasons?: string[]
  onUploaded?: (url: string) => void
}) {
  const { data: session } = useSession()
  const viewerTimeZone = useViewerTimeZone()
  const timeZoneLabel = `${zoneDisplayName(viewerTimeZone)} (${zoneAbbreviation(viewerTimeZone)})`
  const [iconUploading, setIconUploading] = useState(false)
  const [iconError, setIconError] = useState<string | null>(null)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [bannerCroppingSrc, setBannerCroppingSrc] = useState<string | null>(null)
  const [fetchedSeasons, setFetchedSeasons] = useState<string[]>(initialSeasons ?? [])

  const [addSeasonModalOpen, setAddSeasonModalOpen] = useState(false)
  const upcoming = upcomingSeason()
  const [addingSeason, setAddingSeason] = useState(false)
  const [addSeasonError, setAddSeasonError] = useState<string | null>(null)

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
      set("season", fetchedSeasons[0])
    }
  }, [fetchedSeasons, form.season])

  const options = Array.from(new Set([...fetchedSeasons]))

  useDontReloadWhileBusy(iconUploading || bannerUploading)

  const set = <K extends keyof MeetFormState>(key: K, value: MeetFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleAddSeason(e: React.FormEvent) {
    e.preventDefault()
    setAddingSeason(true)
    setAddSeasonError(null)

    try {
        const res = await fetch("/api/seasons", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: upcoming })
        })

        if (!res.ok) {
            const data = await res.json()
            setAddSeasonError(data.error || "Failed to add season")
            return
        }
        setFetchedSeasons(prev => [...prev, upcoming]);
        console.log("Setting season to:", upcoming);
        set("season", upcoming);
        setAddSeasonModalOpen(false);
    } finally {
        setAddingSeason(false)
    }
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIconUploading(true)
    setIconError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/meets/icon", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        setIconError(data.error ?? "Upload failed")
        return
      }

      set("iconUrl", data.url)
      onUploaded?.(data.url)
    } catch {
      setIconError("Something went wrong")
    } finally {
      setIconUploading(false)
      e.target.value = ""
    }
  }

  function handleIconRemove() {
    if (!form.iconUrl) return
    set("iconUrl", "")
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    setBannerError(null)
    setBannerCroppingSrc(URL.createObjectURL(file))
  }

  async function onBannerCropped(blob: Blob) {
    setBannerUploading(true)
    setBannerError(null)

    try {
      const formData = new FormData()
      formData.append("file", blob, "banner.jpg")

      const res = await fetch("/api/meets/banner", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        setBannerError(data.error ?? "Upload failed")
        return
      }

      set("bannerUrl", data.url)
      onUploaded?.(data.url)
    } catch {
      setBannerError("Something went wrong")
    } finally {
      setBannerUploading(false)
      if (bannerCroppingSrc) URL.revokeObjectURL(bannerCroppingSrc)
      setBannerCroppingSrc(null)
    }
  }

  function handleBannerRemove() {
    if (!form.bannerUrl) return
    set("bannerUrl", "")
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Meet name <span className="text-error">*</span></label>
        <input
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Sting 'Em Classic"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>
          Meet icon
        </label>
        <div className="space-y-2">
          <FileDropzone
            onFilesSelected={(files) => handleIconUpload({ target: { files: files as any } } as any)}
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
            disabled={iconUploading}
            className={fileDropzoneSurfaceClassName(Boolean(form.iconUrl), iconUploading)}
          >
            <FileDropzoneContent
              fileName={form.iconUrl ? decodeURIComponent(form.iconUrl.split("/").pop() ?? "Meet icon") : null}
              emptyLabel="Click or drag and drop to upload an icon"
              uploading={iconUploading}
              onRemove={handleIconRemove}
            />
          </FileDropzone>
          {form.iconUrl && !iconUploading && (
            <div className="flex items-center gap-3">
              <img
                src={form.iconUrl}
                alt="Meet icon preview"
                className="h-12 w-12 rounded-lg object-cover border border-border border-border"
              />
            </div>
          )}
          {iconError && (
            <p className="text-xs text-error">
              {iconError}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Meet banner
        </label>
        <div className="space-y-2">
          <FileDropzone
            onFilesSelected={(files) => handleBannerUpload({ target: { files: files as any } } as any)}
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            disabled={bannerUploading}
            className={fileDropzoneSurfaceClassName(Boolean(form.bannerUrl), bannerUploading)}
          >
            <FileDropzoneContent
              fileName={form.bannerUrl ? decodeURIComponent(form.bannerUrl.split("/").pop() ?? "Meet banner") : null}
              emptyLabel="Click or drag and drop to upload a banner"
              uploading={bannerUploading}
              onRemove={handleBannerRemove}
            />
          </FileDropzone>
          {form.bannerUrl && !bannerUploading && (
            <div className="flex items-center gap-3">
              <img
                src={form.bannerUrl}
                alt="Meet banner preview"
                className="aspect-[2/1] w-64 rounded-lg object-cover border border-border border-border"
              />
            </div>
          )}
          {bannerError && (
            <p className="text-xs text-error">
              {bannerError}
            </p>
          )}
        </div>
      </div>

      <BannerCropper
        imageSrc={bannerCroppingSrc}
        isOpen={bannerCroppingSrc !== null}
        onClose={() => {
            if (bannerCroppingSrc) URL.revokeObjectURL(bannerCroppingSrc)
            setBannerCroppingSrc(null)
        }}
        onSave={onBannerCropped}
      />

      <div>
        <label className={labelClass}>Location</label>
        <input
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="McAuley Aquatic Center"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>School</label>
        <input
          value={form.school}
          onChange={(e) => set("school", e.target.value)}
          placeholder="Georgia Tech"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Start Date <span className="text-error">*</span></label>
          <DatePicker
            value={form.startDate}
            onChange={(value) =>
              setForm((f) => ({
                ...f,
                startDate: value,
                // Keep end on/after start as soon as start moves past it.
                endDate: f.endDate && value && f.endDate < value ? value : f.endDate,
              }))
            }
            ariaLabel="Start date"
            placeholder="Choose a start date"
            required
          />
        </div>
        <div>
          <label className={labelClass}>
            Start Time
          </label>
          <TimePicker
            value={form.startTime}
            onChange={(value) =>
              setForm((f) => ({
                ...f,
                startTime: value,
                timeZone: value ? viewerTimeZone : f.timeZone,
              }))
            }
            ariaLabel="Start time"
            placeholder="Choose a start time"
            zoneLabel={timeZoneLabel}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          End Date
        </label>
        <DatePicker
          value={form.endDate}
          onChange={(value) => set("endDate", value)}
          ariaLabel="End date"
          placeholder="Choose an end date"
          clearable
          min={form.startDate || undefined}
        />
        {form.startDate && form.endDate && form.endDate < form.startDate ? (
          <p className="mt-1 text-xs text-error">End date must be on or after the start date.</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Course<span className="text-error">*</span></label>
          <select
            required
            value={form.course}
            onChange={(e) => set("course", e.target.value)}
            className={inputClass}
          >
            <option value="SCY">SCY</option>
            <option value="LCM">LCM</option>
            <option value="SCM">SCM</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Season<span className="text-error">*</span></label>
          <select
            required
            value={form.season}
            onChange={(e) => {
                if (e.target.value === "ADD_NEW") {
                    setAddSeasonModalOpen(true)
                } else {
                    set("season", e.target.value)
                }
            }}
            onBlur={(e) => {
                // If it was just added via modal, it might already be selected
                if (e.target.value === "ADD_NEW") {
                    // Force re-select the newly added season if it exists in options now
                    const newest = options[0];
                    if (newest && newest !== "ADD_NEW") set("season", newest);
                }
            }}
            className={inputClass}
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
             {isStaffRole(session?.user?.role ?? "") && !fetchedSeasons.includes(upcoming) && <option value="ADD_NEW">+ New Season</option>}
          </select>
        </div>
      </div>

      <Modal
        open={addSeasonModalOpen}
        onClose={() => {
            setAddSeasonModalOpen(false)
            setAddSeasonError(null)
        }}
        title="Add new season"
        maxWidth="sm"
        onSubmit={handleAddSeason}
        footer={
          <ModalFooter>
             {fetchedSeasons.includes(upcoming) ? (
                <button
                    type="button"
                    onClick={() => {
                        setAddSeasonModalOpen(false)
                        setAddSeasonError(null)
                    }}
                    className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-fill-secondary"
                >
                    Close
                </button>
             ) : (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            setAddSeasonModalOpen(false)
                            setAddSeasonError(null)
                        }}
                        className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-fill-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={addingSeason}
                        className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
                    >
                        {addingSeason ? "Adding..." : "Confirm"}
                    </button>
                </>
             )}
          </ModalFooter>
        }
      >
        {fetchedSeasons.includes(upcoming) ? (
            <p className="text-sm text-foreground">Season {upcoming} already exists. You can add another season next year.</p>
        ) : (
            <p className="text-sm text-foreground">Confirm you want to add the {upcoming} season?</p>
        )}
        {addSeasonError && <p className="text-sm text-error">{addSeasonError}</p>}
      </Modal>
    </div>
  )
}
