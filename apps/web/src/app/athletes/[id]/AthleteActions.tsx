"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import ActionIcon from "@/components/ui/ActionIcon"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { ICON_BUTTON, ICON_BUTTON_DANGER, SwimCloudProfileLinks } from "./AthleteIconButton"
import SwimCloudIdsInput, { useSwimCloudIdsField } from "@/components/athlete/SwimCloudIdsInput"
import { updateAthlete, deleteAthlete, removeAthleteFromSeasons } from "./athlete.actions"
import { athletePath } from "@/lib/slug"
import { buildFullPath, carryBackTarget } from "@/lib/navigation-history"
import { formatSeasonLabel } from "@swimbuzz/shared"

type AthleteActionsProps = {
  athleteId: string
  firstName: string
  lastName: string
  email: string
  swimCloudIds: number[]
  preferredName: string | null
  gender: "M" | "F"
  gtid: string | null
  /** "YYYY-MM-DD", the Eastern calendar day it's stored on. */
  dob: string | null
  /** Seasons whose rosters they're on. With more than one, delete first offers taking them off seasons. */
  seasons: string[]
  /** Academic year per season they're on. */
  yearBySeason: Record<string, string>
}

const GTID_LENGTH = 9
const GTID_ERROR = "GTID must be 9 digits starting with 90"

export default function AthleteActions({
  athleteId,
  firstName,
  lastName,
  email,
  swimCloudIds,
  preferredName,
  gender,
  gtid,
  dob,
  seasons,
  yearBySeason,
}: AthleteActionsProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  /** "seasons": pick seasons to take them off; "permanent": confirm deleting them entirely. */
  const [deleteStep, setDeleteStep] = useState<"seasons" | "permanent" | null>(null)
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const loading = isPending
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName,
    lastName,
    email,
    preferredName: preferredName ?? "",
    gender,
    gtid: gtid ?? "",
    dob: dob ?? "",
  })
  const [years, setYears] = useState<Record<string, string>>(yearBySeason)
  const swimCloud = useSwimCloudIdsField(swimCloudIds)

  function openEdit() {
    setForm({
      firstName,
      lastName,
      email,
      preferredName: preferredName ?? "",
      gender,
      gtid: gtid ?? "",
      dob: dob ?? "",
    })
    swimCloud.reset(swimCloudIds)
    setYears(yearBySeason)
    setError(null)
    setEditing(true)
  }

  const gtidOk = form.gtid === "" || /^90\d{7}$/.test(form.gtid)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!swimCloud.valid || !gtidOk) return
    setError(null)
    startTransition(async () => {
      try {
        const updated = await updateAthlete(athleteId, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          swimCloudIds: swimCloud.allIds,
          preferredName: form.preferredName,
          gender: form.gender,
          gtid: form.gtid === "" ? null : form.gtid,
          dob: form.dob === "" ? null : form.dob,
          yearBySeason: Object.fromEntries(seasons.map((season) => [season, years[season]?.trim() || null])),
        })
        setEditing(false)
        // A name change produces a new slug. router.replace swaps the current history entry (so
        // Back still returns to the previous page) and soft-navigates, fetching fresh data.
        if (updated.slug && athletePath(updated.slug) !== window.location.pathname) {
          const search = window.location.search.replace(/^\?/, "")
          const nextPath = buildFullPath(athletePath(updated.slug), search)
          carryBackTarget(buildFullPath(window.location.pathname, search), nextPath)
          router.replace(nextPath)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes")
      }
    })
  }

  const multiSeason = seasons.length > 1
  // "2025-2026" labels sort chronologically as strings; newest first.
  const seasonsDesc = [...seasons].sort().reverse()
  const removingAll = removing.size === seasons.length

  function openDelete() {
    setError(null)
    setRemoving(new Set())
    setDeleteStep(multiSeason ? "seasons" : "permanent")
  }

  function toggleRemoving(season: string) {
    setRemoving((prev) => {
      const next = new Set(prev)
      if (next.has(season)) next.delete(season)
      else next.add(season)
      return next
    })
  }

  function handleRemoveSeasons() {
    if (removing.size === 0 || removingAll) return
    setError(null)
    startTransition(async () => {
      try {
        await removeAthleteFromSeasons(athleteId, [...removing])
        setDeleteStep(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove from season")
      }
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteAthlete(athleteId)
        router.push("/athletes")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete athlete")
      }
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SwimCloudProfileLinks swimCloudIds={swimCloudIds} />
        <button
          type="button"
          onClick={openEdit}
          aria-label="Edit athlete"
          className={`${ICON_BUTTON} h-9 w-9`}
        >
          <ActionIcon kind="edit" className="h-5 w-5" />
          <HoverDetail label="Edit athlete" />
        </button>
        <button
          type="button"
          onClick={openDelete}
          aria-label={multiSeason ? "Remove athlete" : "Delete athlete"}
          className={`${ICON_BUTTON_DANGER} h-9 w-9`}
        >
          <ActionIcon kind="delete" className="h-5 w-5" />
          <HoverDetail label={multiSeason ? "Remove athlete" : "Delete athlete"} />
        </button>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        closeDisabled={loading}
        title="Edit athlete"
        maxWidth="md"
        onSubmit={handleSave}
        footer={
          <ModalFooter>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={loading}
                className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
              >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !swimCloud.valid || !gtidOk}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </ModalFooter>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary dark:text-foreground-secondary mb-1">
            First name <span className="text-error">*</span>
          </label>
          <input
            required
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Last name <span className="text-error">*</span>
            </label>
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Preferred name
            </label>
            <input
              type="text"
              value={form.preferredName}
              onChange={(e) => setForm((f) => ({ ...f, preferredName: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
            />
          </div>
          <div>
            <label htmlFor="edit-athlete-gender" className="block text-xs font-medium text-foreground-secondary mb-1">
              Gender <span className="text-error">*</span>
            </label>
            <div className="relative">
              <select
                id="edit-athlete-gender"
                required
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as "M" | "F" }))}
                className="w-full appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-9 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
              >
                <option value="F">Women</option>
                <option value="M">Men</option>
              </select>
              <AppIcon
                name="chevronDown"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-tertiary"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Email <span className="text-error">*</span>
          </label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">GTID</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={GTID_LENGTH}
              placeholder="e.g. 903123456"
              title={GTID_ERROR}
              value={form.gtid}
              onChange={(e) =>
                setForm((f) => ({ ...f, gtid: e.target.value.replace(/\D/g, "").slice(0, GTID_LENGTH) }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
              aria-invalid={!gtidOk}
              aria-describedby={!gtidOk ? "edit-gtid-hint" : undefined}
            />
            {!gtidOk && (
              <p id="edit-gtid-hint" className="mt-1 text-xs text-warning-text">
                {GTID_ERROR}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">Date of birth</label>
            <input
              type="date"
              value={form.dob}
              onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {seasonsDesc.map((season) => (
            <div key={season}>
              <label
                htmlFor={`edit-year-${season}`}
                className="block text-xs font-medium text-foreground-secondary mb-1"
              >
                {multiSeason ? `Year in ${formatSeasonLabel(season)}` : "Year"}
              </label>
              <input
                id={`edit-year-${season}`}
                type="text"
                maxLength={40}
                placeholder="e.g. 2, SO, Masters"
                value={years[season] ?? ""}
                onChange={(e) => setYears((y) => ({ ...y, [season]: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
              />
            </div>
          ))}
        </div>

        <div>
          <label
            htmlFor="edit-swimcloud-ids"
            className="block text-xs font-medium text-foreground-secondary mb-1"
          >
            SwimCloud ID/URL
          </label>
          <SwimCloudIdsInput field={swimCloud} id="edit-swimcloud-ids" />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>

      <Modal
        open={deleteStep === "seasons"}
        onClose={() => setDeleteStep(null)}
        closeDisabled={loading}
        title="Remove from season"
        description={
          <>
            Take <span className="font-medium">{firstName} {lastName}</span>{" "}
            off these seasons&apos; rosters. Their swims and team history stay.
          </>
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setDeleteStep(null)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveSeasons}
              disabled={loading || removing.size === 0 || removingAll}
              className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-error-hover disabled:opacity-50"
            >
              {loading ? "Removing…" : "Remove"}
            </button>
          </ModalFooter>
        }
      >
        <ul className="overflow-hidden rounded-lg border border-border">
          {seasonsDesc.map((season) => {
            const checked = removing.has(season)
            return (
              <li key={season} className="border-b border-border last:border-b-0">
                <label
                  className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 ${
                    checked ? "bg-primary/5" : "hover:bg-background-hover"
                  }`}
                >
                  <span className="relative flex h-[18px] w-[18px] shrink-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRemoving(season)}
                      disabled={loading}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors duration-200 peer-focus-visible:border-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-primary/34 ${
                        checked
                          ? "border-primary bg-primary text-primary-contrast"
                          : "border-border bg-background text-transparent group-hover:border-primary"
                      }`}
                    >
                      <ActionIcon kind="check" className="!h-3 !w-3" />
                    </span>
                  </span>
                  <span className="text-sm font-medium text-foreground">{formatSeasonLabel(season)}</span>
                </label>
              </li>
            )
          })}
        </ul>
        {removingAll && (
          <p className="text-xs text-warning-text">
            An athlete has to stay on at least one season. To remove them entirely, delete them permanently.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setError(null)
            setDeleteStep("permanent")
          }}
          disabled={loading}
          className="block text-sm font-medium text-error hover:underline disabled:opacity-50"
        >
          Delete permanently…
        </button>
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>

      <Modal
        open={deleteStep === "permanent"}
        onClose={() => setDeleteStep(null)}
        closeDisabled={loading}
        title="Delete athlete"
        description={
          <>
            Permanently delete <span className="font-medium">{firstName} {lastName}</span> and all
            of their swim records{multiSeason ? " from every season" : ""}? This cannot be undone.
          </>
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => (multiSeason ? setDeleteStep("seasons") : setDeleteStep(null))}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              {multiSeason ? "Back" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-error-hover disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </ModalFooter>
        }
      >
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}
