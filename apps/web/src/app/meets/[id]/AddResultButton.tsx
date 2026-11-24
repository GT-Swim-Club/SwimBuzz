"use client"

import type { ReactNode } from "react"
import { useMemo, useState, useTransition } from "react"
import { parseTime } from "@/lib/utils"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import { DatePicker } from "@/components/ui/CustomDateTimePicker"
import AthletePairingSelect, { rosterOptionsFromLastFirst } from "@/components/meet/AthletePairingSelect"
import { addMeetSwim } from "./meet-swims.actions"
import { upsertRelayEntry } from "./meet-entries.actions"
import { INDIVIDUAL_SWIM_EVENTS, RELAY_SWIM_EVENTS } from "@swimbuzz/shared"

const INDIVIDUAL_EVENTS = INDIVIDUAL_SWIM_EVENTS

const RELAY_EVENTS = RELAY_SWIM_EVENTS

type AthleteOption = { id: string; name: string; gender?: "M" | "F" }

type Round = "" | "P" | "F"

/** One box per 50 for races of 100 and up ("200 Free" → 4); none for a 50. */
function splitCount(event: string): number {
  const distance = parseInt(event, 10)
  return Number.isFinite(distance) && distance >= 100 ? Math.floor(distance / 50) : 0
}

function RoundSelect({ value, onChange }: { value: Round; onChange: (round: Round) => void }) {
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-foreground-secondary mb-1">Round</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Round)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
      >
        <option value="">Timed final</option>
        <option value="P">Prelims</option>
        <option value="F">Finals</option>
      </select>
    </div>
  )
}

export default function AddResultButton({
  meetId,
  meetName,
  defaultCourse,
  defaultDate,
  athletes,
  trigger,
}: {
  meetId: string
  meetName: string
  defaultCourse: string
  defaultDate: string
  athletes: AthleteOption[]
  /** Custom trigger; receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"individual" | "relay">("individual")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  
  const [form, setForm] = useState({
    athleteId: athletes[0]?.id ?? "",
    event: INDIVIDUAL_EVENTS[0],
    time: "",
    course: defaultCourse,
    date: defaultDate,
    round: "" as Round,
    splits: [] as string[],
    relayForm: {
      event: RELAY_EVENTS[0],
      legs: ["", "", "", ""] as [string, string, string, string],
      splits: ["", "", "", ""] as [string, string, string, string],
      round: "" as Round,
      gender: "F" as "F" | "M" | "X",
    }
  })
  const loading = isPending
  const roster = useMemo(() => rosterOptionsFromLastFirst(athletes), [athletes])

  function openModal() {
    setForm({
      athleteId: athletes[0]?.id ?? "",
      event: INDIVIDUAL_EVENTS[0],
      time: "",
      course: defaultCourse,
      date: defaultDate,
      round: "",
      splits: [],
      relayForm: {
        event: RELAY_EVENTS[0],
        legs: ["", "", "", ""],
        splits: ["", "", "", ""],
        round: "",
        gender: "F",
      }
    })
    setError(null)
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (type === "individual") {
      if (!form.athleteId) {
        setError("Pick a swimmer")
        return
      }
      const timeMs = Math.round(parseTime(form.time))
      if (!Number.isFinite(timeMs) || timeMs <= 0) {
        setError("Invalid time format")
        return
      }

      startTransition(async () => {
        try {
          await addMeetSwim({
            athleteId: form.athleteId,
            event: form.event,
            course: form.course,
            date: form.date,
            meet: meetName,
            meetId,
            timeMs,
            round: form.round,
            splits: form.splits.slice(0, splitCount(form.event)),
          })
          setOpen(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save swim")
        }
      })
    } else {
      if (form.relayForm.legs.some((id) => !id) || new Set(form.relayForm.legs).size !== 4) {
        setError("Pick four different swimmers")
        return
      }

      startTransition(async () => {
        try {
          const saved = await upsertRelayEntry(meetId, {
            event: form.relayForm.event,
            relayLetter: "A",
            relayRound: form.relayForm.round,
            gender: form.relayForm.gender,
            legs: form.relayForm.legs.map((athleteId, i) => ({
              leg: i + 1,
              athleteId,
              splitTime: form.relayForm.splits[i].trim() || undefined,
            })),
            resultTime: form.time,
          })
          // A relay being edited in the relay builder comes back as an error, not a throw.
          if (!saved.ok) {
            setError(saved.error)
            return
          }
          setOpen(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save relay")
        }
      })
    }
  }

  return (
    <>
      {trigger ? (
        trigger(openModal)
      ) : (
        <button
          type="button"
          onClick={openModal}
          disabled={athletes.length === 0}
          className="text-xs px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill disabled:opacity-40 transition-colors"
        >
          Add swim
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Add swim result"
        description={meetName}
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
             <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.time}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save result"}
            </button>
          </ModalFooter>
        }
      >
        <SegmentedToggle
          selectedIndex={type === "relay" ? 1 : 0}
          fullWidth
          className="mb-4 rounded-lg border border-border bg-background"
        >
          <button type="button" onClick={() => setType("individual")} className={segmentedOptionClass(type === "individual")}>Individual</button>
          <button type="button" onClick={() => setType("relay")} className={segmentedOptionClass(type === "relay")}>Relay</button>
        </SegmentedToggle>

        {type === "individual" ? (
         <>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">Athlete <span className="text-error">*</span></label>
              <AthletePairingSelect
                value={form.athleteId}
                roster={roster}
                onChange={(athleteId) => setForm((f) => ({ ...f, athleteId }))}
                label="Athlete"
                placeholder="Select swimmer…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">Event</label>
                <select value={form.event} onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background">
                  {INDIVIDUAL_EVENTS.map((ev) => <option key={ev}>{ev}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">Course</label>
                <select value={form.course} onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background">
                  <option>SCY</option><option>LCM</option><option>SCM</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">Time <span className="text-error">*</span></label>
                <input required placeholder="1:23.45" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">Date <span className="text-error">*</span></label>
                <DatePicker
                  value={form.date}
                  onChange={(value) => setForm((form) => ({ ...form, date: value }))}
                  ariaLabel="Date"
                  required
                  clearable
                />
              </div>
            </div>
            <RoundSelect value={form.round} onChange={(round) => setForm((f) => ({ ...f, round }))} />
            {splitCount(form.event) > 0 ? (
              <div className="mt-3">
                <label className="block text-xs font-medium text-foreground-secondary mb-1">Splits</label>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: splitCount(form.event) }, (_, i) => (
                    <div key={i}>
                      <span className="mb-0.5 block text-[11px] tabular-nums text-foreground-tertiary">{(i + 1) * 50}</span>
                      <input
                        aria-label={`${(i + 1) * 50} split`}
                        placeholder="26.10"
                        value={form.splits[i] ?? ""}
                        onChange={(e) => {
                          const splits = [...form.splits]
                          splits[i] = e.target.value
                          setForm((f) => ({ ...f, splits: Array.from(splits, (v) => v ?? "") }))
                        }}
                        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm font-mono bg-background"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-foreground-tertiary">Each 50&apos;s time, or the running time at each mark.</p>
              </div>
            ) : null}
         </>
        ) : (
          <>
             <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">Relay Event</label>
                <select value={form.relayForm.event} onChange={(e) => setForm(f => ({ ...f, relayForm: {...f.relayForm, event: e.target.value} }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background">
                  {RELAY_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">Gender</label>
                <select value={form.relayForm.gender} onChange={(e) => setForm(f => ({ ...f, relayForm: {...f.relayForm, gender: e.target.value as "F" | "M" | "X"} }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background">
                  <option value="F">Women&apos;s</option><option value="M">Men&apos;s</option><option value="X">Mixed</option>
                </select>
              </div>
            </div>
            <RoundSelect
              value={form.relayForm.round}
              onChange={(round) => setForm((f) => ({ ...f, relayForm: { ...f.relayForm, round } }))}
            />
            <div className="space-y-2 mt-3">
              <label className="block text-xs font-medium text-foreground-secondary">Athletes <span className="text-error">*</span></label>
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                <AthletePairingSelect
                  value={form.relayForm.legs[i]}
                  roster={roster}
                  onChange={(athleteId) => {
                    const legs = [...form.relayForm.legs] as [string, string, string, string]
                    legs[i] = athleteId
                    setForm((f) => ({ ...f, relayForm: { ...f.relayForm, legs } }))
                  }}
                  label={`Leg ${i + 1} swimmer`}
                  placeholder="Select swimmer…"
                />
                </div>
                <input
                  aria-label={`Leg ${i + 1} split`}
                  placeholder="Split"
                  value={form.relayForm.splits[i]}
                  onChange={(e) => {
                    const splits = [...form.relayForm.splits] as [string, string, string, string]
                    splits[i] = e.target.value
                    setForm((f) => ({ ...f, relayForm: { ...f.relayForm, splits } }))
                  }}
                  className="w-24 shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background"
                />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-foreground-secondary mb-1">Time <span className="text-error">*</span></label>
              <input required placeholder="1:23.45" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background" />
            </div>
          </>
        )}
        {error && <p className="text-sm text-error mt-4">{error}</p>}
      </Modal>
    </>
  )
}
