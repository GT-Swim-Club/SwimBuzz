"use client"

import { currentSeason, seasonOptions } from "@/lib/season"

export type MeetFormState = {
  name: string
  location: string
  startDate: string
  endDate: string
  course: string
  season: string
  packetUrl: string
  psychSheetUrl: string
  heatSheetUrl: string
  resultsUrl: string
}

export const emptyMeetForm: MeetFormState = {
  name: "",
  location: "",
  startDate: "",
  endDate: "",
  course: "SCY",
  season: currentSeason(),
  packetUrl: "",
  psychSheetUrl: "",
  heatSheetUrl: "",
  resultsUrl: "",
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
const labelClass =
  "block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1"

export default function MeetFields({
  form,
  setForm,
}: {
  form: MeetFormState
  setForm: React.Dispatch<React.SetStateAction<MeetFormState>>
}) {
  const set = <K extends keyof MeetFormState>(key: K, value: MeetFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Meet name</label>
        <input
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Sting 'Em Classic"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Location</label>
        <input
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="McAuley Aquatic Center, Atlanta GA"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Start date</label>
          <input
            required
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            End date <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Course</label>
          <select
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
          <label className={labelClass}>Season</label>
          <select
            value={form.season}
            onChange={(e) => set("season", e.target.value)}
            className={inputClass}
          >
            {seasonOptions().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
