"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { MeetSignupQuestion } from "@/lib/meet-signup"
import { formatRoomLabel, roomAthleteSlotCount } from "@/lib/meet-rooms"

type AthleteOption = { id: string; name: string; gender: "M" | "F" }

type RoomDraft = {
  athleteIds: string[]
}

type PreferenceRow = {
  athleteId: string
  firstName: string
  lastName: string
  preferredAthleteIds: string[]
  excludedAthleteIds: string[]
  notes: string
  answers: Record<string, string>
}

export default function MeetRoomAssignmentEditor({
  meetId,
  athletes,
  customQuestions,
  preferences,
  initialRooms,
  assignmentsPublishedAt,
  meetHasEnded,
}: {
  meetId: string
  athletes: AthleteOption[]
  customQuestions: MeetSignupQuestion[]
  preferences: PreferenceRow[]
  initialRooms: Array<{ athleteIds: string[] }>
  assignmentsPublishedAt: string | null
  meetHasEnded: boolean
}) {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomDraft[]>(initialRooms)
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState(!!assignmentsPublishedAt)

  useEffect(() => {
    setRooms(initialRooms)
    setPublished(!!assignmentsPublishedAt)
  }, [initialRooms, assignmentsPublishedAt])

  const athleteNameById = useMemo(
    () => new Map(athletes.map((a) => [a.id, a.name])),
    [athletes]
  )

  const assignedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const room of rooms) {
      for (const id of room.athleteIds) ids.add(id)
    }
    return ids
  }, [rooms])

  const unassigned = athletes.filter((a) => !assignedIds.has(a.id))

  function addRoom() {
    setRooms((prev) => [...prev, { athleteIds: [] }])
  }

  function removeRoom(index: number) {
    setRooms((prev) => prev.filter((_, i) => i !== index))
  }

  function setAthleteAtSlot(roomIndex: number, slot: number, athleteId: string) {
    if (!athleteId) return
    setRooms((prev) =>
      prev.map((r, i) => {
        if (i !== roomIndex) return r
        const current = r.athleteIds[slot]
        if (current === athleteId) return r
        const next = [...r.athleteIds]
        if (slot >= next.length) {
          next.push(athleteId)
        } else {
          next[slot] = athleteId
        }
        return { ...r, athleteIds: next }
      })
    )
  }

  function clearAthleteAtSlot(roomIndex: number, slot: number) {
    setRooms((prev) =>
      prev.map((r, i) => {
        if (i !== roomIndex || slot >= r.athleteIds.length) return r
        const next = [...r.athleteIds]
        next.splice(slot, 1)
        return { ...r, athleteIds: next }
      })
    )
  }

  function slotAthleteOptions(athleteId: string | undefined) {
    return athletes.filter((a) => a.id === athleteId || !assignedIds.has(a.id))
  }

  async function loadSuggestions() {
    setSuggesting(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/rooms/suggestions`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to load suggestions")
        return
      }
      setRooms(
        (data.rooms as Array<{ athleteIds: string[] }>).map((r) => ({
          athleteIds: [...r.athleteIds],
        }))
      )
    } catch {
      setError("Failed to load suggestions")
    } finally {
      setSuggesting(false)
    }
  }

  async function persistAssignments(): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await fetch(`/api/meets/${meetId}/rooms/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Failed to save draft" }
    }
    return { ok: true }
  }

  async function saveDraft() {
    setSaving(true)
    setError(null)
    try {
      const result = await persistAssignments()
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    } catch {
      setError("Failed to save draft")
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish() {
    setPublishing(true)
    setError(null)
    try {
      if (!published) {
        const result = await persistAssignments()
        if (!result.ok) {
          setError(result.error)
          return
        }
      }

      const res = await fetch(`/api/meets/${meetId}/rooms/publish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to update publish status")
        return
      }
      setPublished(!!data.assignmentsPublishedAt)
      router.refresh()
    } catch {
      setError("Failed to update publish status")
    } finally {
      setPublishing(false)
    }
  }

  const hasAssignments = rooms.some((r) => r.athleteIds.length > 0)

  const preferenceLabel = (athleteId: string) => {
    const pref = preferences.find((p) => p.athleteId === athleteId)
    if (!pref || pref.preferredAthleteIds.length === 0) return "—"
    return pref.preferredAthleteIds
      .map((id) => athleteNameById.get(id) ?? "?")
      .join(", ")
  }

  const exclusionLabel = (athleteId: string) => {
    const pref = preferences.find((p) => p.athleteId === athleteId)
    if (!pref || pref.excludedAthleteIds.length === 0) return "—"
    return pref.excludedAthleteIds
      .map((id) => athleteNameById.get(id) ?? "?")
      .join(", ")
  }

  const athleteSlots = roomAthleteSlotCount(rooms, {
    extraEmptySlot: !meetHasEnded && unassigned.length > 0,
  })

  return (
    <div className="space-y-4">
      {preferences.length === 0 && athletes.length === 0 && (
        <p className="text-sm text-foreground-secondary">
          No athletes on this meet&apos;s roster yet. Import entries or wait for sign-ups.
        </p>
      )}

      {preferences.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-fill-secondary/50 text-left text-xs uppercase tracking-wide text-foreground-secondary">
                <th className="px-3 py-2 font-medium">Athlete</th>
                <th className="px-3 py-2 font-medium">Preferences</th>
                <th className="px-3 py-2 font-medium">Exclusions</th>
                {customQuestions.map((q) => (
                  <th key={q.id} className="px-3 py-2 font-medium">
                    {q.label}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preferences.map((p) => (
                <tr key={p.athleteId}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {p.lastName}, {p.firstName}
                  </td>
                  <td className="px-3 py-2 text-foreground-secondary">
                    {preferenceLabel(p.athleteId)}
                  </td>
                  <td className="px-3 py-2 text-foreground-secondary">
                    {exclusionLabel(p.athleteId)}
                  </td>
                  {customQuestions.map((q) => (
                    <td key={q.id} className="px-3 py-2 text-foreground-secondary max-w-xs truncate">
                      {p.answers[q.id] || "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-foreground-secondary max-w-xs truncate">
                    {p.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!meetHasEnded && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadSuggestions}
            disabled={suggesting || preferences.length === 0}
            className="text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill disabled:opacity-50"
          >
            {suggesting ? "Suggesting…" : "Suggest pairings"}
          </button>
          <button
            type="button"
            onClick={addRoom}
            className="text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill"
          >
            Add room
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || publishing}
            className="text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={togglePublish}
            disabled={publishing || saving || (!published && !hasAssignments)}
            className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-text hover:bg-primary-hover disabled:opacity-50"
          >
            {publishing
              ? published
                ? "Unpublishing…"
                : "Publishing…"
              : published
                ? "Unpublish"
                : "Publish"}
          </button>
          {published && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40">
              Published
            </span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {rooms.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-fill-secondary/50 text-left text-xs uppercase tracking-wide text-foreground-secondary">
                <th className="px-2 py-2 font-medium w-12 text-center">Room</th>
                {Array.from({ length: athleteSlots }, (_, i) => (
                  <th key={i} className="px-3 py-2 font-medium">
                    Athlete {i + 1}
                  </th>
                ))}
                {!meetHasEnded && <th className="px-3 py-2 font-medium w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rooms.map((room, roomIndex) => (
                <tr key={roomIndex}>
                  <td className="px-2 py-2 whitespace-nowrap font-medium align-middle text-center w-12">
                    {formatRoomLabel(roomIndex + 1)}
                  </td>
                  {Array.from({ length: athleteSlots }, (_, slot) => {
                    const athleteId = room.athleteIds[slot]
                    return (
                      <td key={slot} className="px-3 py-2 align-middle">
                        {!meetHasEnded ? (
                          <select
                            value={athleteId ?? ""}
                            onChange={(e) => {
                              const val = e.target.value
                              if (!val) clearAthleteAtSlot(roomIndex, slot)
                              else setAthleteAtSlot(roomIndex, slot, val)
                            }}
                            className="w-full min-w-[8rem] rounded-lg border border-border px-2 py-1.5 text-sm bg-background"
                          >
                            <option value="">—</option>
                            {slotAthleteOptions(athleteId).map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        ) : athleteId ? (
                          <span className="whitespace-nowrap">
                            {athleteNameById.get(athleteId) ?? athleteId}
                          </span>
                        ) : (
                          <span className="text-foreground-secondary">—</span>
                        )}
                      </td>
                    )
                  })}
                  {!meetHasEnded && (
                    <td className="px-3 py-2 align-middle w-12">
                      <button
                        type="button"
                        onClick={() => removeRoom(roomIndex)}
                        className="inline-flex items-center justify-center text-foreground-tertiary hover:text-error"
                        aria-label={`Remove room ${roomIndex + 1}`}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-2">
          <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide mb-1">
            Unassigned ({unassigned.length})
          </p>
          <p className="text-sm text-foreground-secondary">
            {unassigned.map((a) => a.name).join(", ")}
          </p>
        </div>
      )}
    </div>
  )
}
