"use client"

import type { ReactNode } from "react"
import { useState, useTransition } from "react"
import { isValidSignupEntryTime } from "@/lib/meet/meet-signup"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { addIndividualSheetEntry, upsertRelayEntry } from "./meet-entries.actions"

const RELAY_EVENTS = [
  "200 Medley Relay",
  "200 Free Relay",
  "400 Free Relay",
  "800 Free Relay",
  "400 Medley Relay",
]

type AthleteOption = { id: string; name: string; gender?: "M" | "F" }

export default function AddIndividualEntryButton({
  meetId,
  athletes,
  trigger,
}: {
  meetId: string
  athletes: AthleteOption[]
  /** Custom trigger; receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<"individual" | "relay">("individual")
  const [form, setForm] = useState({
    athleteId: "",
    event: "",
    seedTime: "NT",
    relayForm: {
      event: RELAY_EVENTS[0],
      legs: ["", "", "", ""] as [string, string, string, string],
      gender: "F" as "F" | "M",
    }
  })
  const loading = isPending

  function openModal() {
    setForm({
      athleteId: "",
      event: "",
      seedTime: "NT",
      relayForm: {
        event: RELAY_EVENTS[0],
        legs: ["", "", "", ""],
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
      if (!form.athleteId || !form.event) {
        setError("Athlete and Event are required")
        return
      }
      if (!isValidSignupEntryTime(form.seedTime)) {
        setError("Invalid seed time format")
        return
      }

      startTransition(async () => {
        try {
          await addIndividualSheetEntry(meetId, {
            athleteId: form.athleteId,
            event: form.event,
            seedTime: form.seedTime,
          })
          setOpen(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save entry")
        }
      })
    } else {
      if (new Set(form.relayForm.legs).size !== 4) {
        setError("Pick four different swimmers")
        return
      }
      if (!isValidSignupEntryTime(form.seedTime)) {
        setError("Invalid seed time format")
        return
      }

      startTransition(async () => {
        try {
          await upsertRelayEntry(meetId, {
            event: form.relayForm.event,
            relayLetter: "A",
            relayRound: "",
            gender: form.relayForm.gender,
            legs: form.relayForm.legs.map((athleteId, i) => ({
              leg: i + 1,
              athleteId,
            })),
            resultTime: form.seedTime === "NT" ? undefined : form.seedTime,
          })
          setOpen(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save relay")
        }
      })
    }
  }

  const swimmerOptions = athletes
  
  const isIndividualValid = form.athleteId !== "" && form.event !== "" && isValidSignupEntryTime(form.seedTime)
  const isRelayValid = form.relayForm.legs.every(id => id !== "") && (new Set(form.relayForm.legs).size === 4) && isValidSignupEntryTime(form.seedTime)
  const isSaveDisabled = loading || (type === "individual" ? !isIndividualValid : !isRelayValid)

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
          Add entry
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Add entry"
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
              disabled={isSaveDisabled}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save entry"}
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
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Athlete <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={form.athleteId}
                onChange={(e) => setForm((f) => ({ ...f, athleteId: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              >
                <option value="">Select swimmer...</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">
                  Event <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g., 50 Free"
                  value={form.event}
                  onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">
                  Seed Time
                </label>
                <input
                  required
                  type="text"
                  placeholder="1:23.45 or NT"
                  value={form.seedTime}
                  onChange={(e) => setForm((f) => ({ ...f, seedTime: e.target.value }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">
                  Relay Event
                </label>
                <select
                  value={form.relayForm.event}
                  onChange={(e) => setForm(f => ({ ...f, relayForm: {...f.relayForm, event: e.target.value} }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
                >
                  {RELAY_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">
                  Gender
                </label>
                <select
                  value={form.relayForm.gender}
                  onChange={(e) => setForm(f => ({ ...f, relayForm: {...f.relayForm, gender: e.target.value as "F" | "M"} }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
                >
                  <option value="F">Women's</option>
                  <option value="M">Men's</option>
                </select>
              </div>
            </div>
            
            <div className="space-y-2 mt-3">
              <label className="block text-xs font-medium text-foreground-secondary">Athletes <span className="text-red-500">*</span></label>
              {[0, 1, 2, 3].map(i => (
                <select
                  key={i}
                  required
                  value={form.relayForm.legs[i]}
                  onChange={(e) => {
                    const legs = [...form.relayForm.legs] as [string, string, string, string]
                    legs[i] = e.target.value
                    setForm(f => ({ ...f, relayForm: {...f.relayForm, legs} }))
                  }}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select swimmer...</option>
                  {swimmerOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              ))}
            </div>
            
            <div className="mt-3">
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Seed Time
              </label>
              <input
                type="text"
                value={form.seedTime}
                onChange={(e) => setForm((f) => ({ ...f, seedTime: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background"
              />
            </div>
          </>
        )}

        {error && (
          <p className="text-sm text-error mt-4">{error}</p>
        )}
      </Modal>
    </>
  )
}
