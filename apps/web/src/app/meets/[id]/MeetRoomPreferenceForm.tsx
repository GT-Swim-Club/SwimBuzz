"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { MeetFormCustomQuestionFields } from "@/components/MeetFormCustomQuestions"
import { roomWindowStatus } from "@/lib/meet-rooms"
import { type MeetSignupQuestion } from "@/lib/meet-signup"
import { saveRoomPreference } from "./MeetRoomPreferenceForm.actions"

export type MeetRoomPreferenceInitial = {
  preferredAthleteIds: string[]
  excludedAthleteIds: string[]
  notes: string
  answers: Record<string, string>
}

type AthleteOption = { id: string; name: string; gender: "M" | "F" }

export default function MeetRoomPreferenceForm({
  meetId,
  maxPreferences,
  instructions,
  customQuestions,
  openAt,
  closeAt,
  isCoach,
  selfAthleteId,
  athletes,
  myPreference,
  pageMode = false,
  openRequest = null,
  onOpenRequestHandled,
}: {
  meetId: string
  maxPreferences: number
  instructions: string
  customQuestions: MeetSignupQuestion[]
  openAt: string | null
  closeAt: string | null
  isCoach: boolean
  selfAthleteId: string | null
  athletes: AthleteOption[]
  myPreference: MeetRoomPreferenceInitial | null
  pageMode?: boolean
  openRequest?: "edit" | null
  onOpenRequestHandled?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(pageMode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>(myPreference?.preferredAthleteIds ?? [])
  const [excluded, setExcluded] = useState<string[]>(myPreference?.excludedAthleteIds ?? [])
  const [notes, setNotes] = useState(myPreference?.notes ?? "")
  const [answers, setAnswers] = useState<Record<string, string>>(myPreference?.answers ?? {})

  const self = athletes.find((a) => a.id === selfAthleteId)
  const window = roomWindowStatus({
    openAt: openAt ? new Date(openAt) : null,
    closeAt: closeAt ? new Date(closeAt) : null,
  })

  const candidates = useMemo(() => {
    if (!self) return []
    return athletes.filter((a) => a.id !== self.id && a.gender === self.gender)
  }, [athletes, self])

  useEffect(() => {
    if (!open) return
    setError(null)
    setSelected(myPreference?.preferredAthleteIds ?? [])
    setExcluded(myPreference?.excludedAthleteIds ?? [])
    setNotes(myPreference?.notes ?? "")
    setAnswers(myPreference?.answers ?? {})
  }, [open, myPreference])

  useEffect(() => {
    if (openRequest === "edit") {
      setOpen(true)
      onOpenRequestHandled?.()
    }
  }, [openRequest, onOpenRequestHandled])

  function togglePreferred(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= maxPreferences || excluded.includes(id)) return prev
      return [...prev, id]
    })
  }

  function toggleExcluded(id: string) {
    setExcluded((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= maxPreferences || selected.includes(id)) return prev
      return [...prev, id]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await saveRoomPreference(meetId, {
        preferredAthleteIds: selected,
        excludedAthleteIds: excluded,
        notes,
        answers,
      })
      if (!pageMode) setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (isCoach || !selfAthleteId) return null
  if (!athletes.some((a) => a.id === selfAthleteId)) return null

  const canEdit = window.open
  const athleteNameById = new Map(athletes.map((a) => [a.id, a.name]))

  return (
    <>
      {!pageMode && (

      <div className="space-y-3">
        {instructions && (
          <p className="text-sm text-foreground-secondary whitespace-pre-wrap">{instructions}</p>
        )}

        {myPreference ? (
          <div className="rounded-lg border border-border bg-fill-secondary/50 px-4 py-3 space-y-2">
            <p className="text-sm font-medium">Your preferences</p>
            {myPreference.preferredAthleteIds.length > 0 || myPreference.excludedAthleteIds.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Want to room with
                </p>
                <ul className="text-sm list-disc list-inside text-foreground-secondary">
                  {myPreference.preferredAthleteIds.map((id) => (
                    <li key={id}>{athleteNameById.get(id) ?? "Unknown"}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-foreground-secondary">No roommate preferences selected.</p>
            )}
            {myPreference.excludedAthleteIds.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Don&apos;t want to room with
                </p>
                <ul className="text-sm list-disc list-inside text-foreground-secondary">
                  {myPreference.excludedAthleteIds.map((id) => (
                    <li key={id}>{athleteNameById.get(id) ?? "Unknown"}</li>
                  ))}
                </ul>
              </div>
            )}
            {customQuestions.map((q) => {
              const value = myPreference.answers[q.id]
              if (!value) return null
              return (
                <p key={q.id} className="text-sm text-foreground-secondary">
                  <span className="font-medium">{q.label}:</span> {value}
                </p>
              )
            })}
            {myPreference.notes && (
              <div>
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Notes
                </p>
                <p className="text-sm text-foreground-secondary">{myPreference.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-foreground-secondary">
            {canEdit ? "Submit your roommate preferences for this meet." : null}
          </p>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"
          >
            {myPreference ? "Edit preferences" : "Set preferences"}
          </button>
        )}
      </div>

      )}

      <Modal
        presentation={pageMode ? "inline" : "dialog"}
        portal={!pageMode}
        panelClassName={pageMode ? "max-h-none overflow-visible shadow-sm" : ""}
        open={open}
        onClose={() => { if (loading) return; if (pageMode) router.push(`/meets/${meetId}`); else setOpen(false) }}
        title={pageMode ? (myPreference ? "Review your preferences" : "Roommate preferences") : "Roommate preferences"}
        maxWidth="3xl"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => { if (pageMode) router.push(`/meets/${meetId}`); else setOpen(false) }}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              {pageMode ? "Back to meet" : "Cancel"}
            </button>
            <button
              type="submit"
              form="meet-room-preference"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <form id="meet-room-preference" onSubmit={handleSubmit} className="space-y-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-foreground-secondary">
              No eligible teammates on this meet&apos;s roster for your gender.
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Want to room with
                </p>
                <p className="text-xs text-foreground-tertiary mb-2">
                  Select up to {maxPreferences}
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {candidates.map((a) => {
                    const checked = selected.includes(a.id)
                    const disabled = !checked && (selected.length >= maxPreferences || excluded.includes(a.id))
                    return (
                      <label
                        key={a.id}
                        className={
                          "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-fill " +
                          (disabled ? "opacity-50 cursor-not-allowed" : "")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => togglePreferred(a.id)}
                          className="rounded border-border"
                        />
                        <span>{a.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Don&apos;t want to room with
                </p>
                <p className="text-xs text-foreground-tertiary mb-2">
                  Select up to {maxPreferences}
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {candidates.map((a) => {
                    const checked = excluded.includes(a.id)
                    const disabled = !checked && (excluded.length >= maxPreferences || selected.includes(a.id))
                    return (
                      <label
                        key={a.id}
                        className={
                          "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-fill " +
                          (disabled ? "opacity-50 cursor-not-allowed" : "")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleExcluded(a.id)}
                          className="rounded border-border"
                        />
                        <span>{a.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <MeetFormCustomQuestionFields
            questions={customQuestions}
            answers={answers}
            onChange={setAnswers}
            disabled={loading}
          />

          <div>
            <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide mb-2">
              Notes
            </p>
            <textarea
              id="meet-room-preference-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any other preferences or constraints…"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
        </form>
      </Modal>
    </>
  )
}
