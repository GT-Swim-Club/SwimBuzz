"use client"

import { useEffect, useMemo, useState, type DragEvent } from "react"
import { useRouter } from "next/navigation"
import type { MeetSignupQuestion } from "@/lib/meet-signup"
import { formatRoomLabel } from "@/lib/meet-rooms"

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
  showPreferences = true,
}: {
  meetId: string
  athletes: AthleteOption[]
  customQuestions: MeetSignupQuestion[]
  preferences: PreferenceRow[]
  initialRooms: Array<{ athleteIds: string[] }>
  assignmentsPublishedAt: string | null
  meetHasEnded: boolean
  showPreferences?: boolean
}) {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomDraft[]>(initialRooms)
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState(!!assignmentsPublishedAt)
  const [draggedAthleteId, setDraggedAthleteId] = useState<string | null>(null)
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null)
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null)

  useEffect(() => {
    setRooms(initialRooms)
    setPublished(!!assignmentsPublishedAt)
  }, [initialRooms, assignmentsPublishedAt])

  const athleteNameById = useMemo(
    () => new Map(athletes.map((a) => [a.id, a.name])),
    [athletes]
  )

  const athleteById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
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
  const unassignedByGender = {
    M: unassigned.filter((athlete) => athlete.gender === "M"),
    F: unassigned.filter((athlete) => athlete.gender === "F"),
  }


  function addRoom() {
    setRooms((prev) => [...prev, { athleteIds: [] }])
  }

  function removeRoom(index: number) {
    setRooms((prev) => prev.filter((_, i) => i !== index))
  }
  function genderOfRoom(room: RoomDraft): AthleteOption["gender"] | null {
    const firstAthleteId = room.athleteIds[0]
    return firstAthleteId
      ? athleteById.get(firstAthleteId)?.gender ?? null
      : null
  }

  function canAssignAthleteToRoom(athleteId: string, room: RoomDraft) {
    const athlete = athleteById.get(athleteId)
    const roomGender = genderOfRoom(room)
    return !!athlete && (!roomGender || athlete.gender === roomGender)
  }


  function moveAthleteToRoom(athleteId: string, targetRoomIndex: number) {
    const targetRoom = rooms[targetRoomIndex]
    if (!targetRoom || !canAssignAthleteToRoom(athleteId, targetRoom)) {
      setError("A room can only include athletes of the same gender")
      return
    }
    setError(null)
    setRooms((prev) => {
      const sourceRoomIndex = prev.findIndex((room) =>
        room.athleteIds.includes(athleteId)
      )
      if (sourceRoomIndex === targetRoomIndex) return prev

      const next = prev.map((room) => ({
        ...room,
        athleteIds: room.athleteIds.filter((id) => id !== athleteId),
      }))
      next[targetRoomIndex] = {
        ...next[targetRoomIndex],
        athleteIds: [...next[targetRoomIndex].athleteIds, athleteId],
      }
      return next
    })
    setSelectedAthleteId(null)
  }

  function unassignAthlete(athleteId: string) {
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        athleteIds: room.athleteIds.filter((id) => id !== athleteId),
      }))
    )
    setSelectedAthleteId(null)
  }

  function handleAthleteDragStart(
    event: DragEvent<HTMLElement>,
    athleteId: string
  ) {
    setDraggedAthleteId(athleteId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", athleteId)
  }

  function endDrag() {
    setDraggedAthleteId(null)
    setActiveDropTarget(null)
  }

  function handleDragOver(event: DragEvent<HTMLElement>, target: string) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setActiveDropTarget(target)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>, target: string) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setActiveDropTarget((current) => (current === target ? null : current))
  }

  function handleRoomDrop(event: DragEvent<HTMLElement>, roomIndex: number) {
    event.preventDefault()
    const athleteId = draggedAthleteId || event.dataTransfer.getData("text/plain")
    if (athleteId) moveAthleteToRoom(athleteId, roomIndex)
    endDrag()
  }

  function handleUnassignedDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const athleteId = draggedAthleteId || event.dataTransfer.getData("text/plain")
    if (athleteId) unassignAthlete(athleteId)
    endDrag()
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


  return (
    <div className="space-y-4">
      {preferences.length === 0 && athletes.length === 0 && (
        <p className="text-sm text-foreground-secondary">
          No athletes on this meet&apos;s roster yet. Import entries or wait for sign-ups.
        </p>
      )}

      {showPreferences && preferences.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-[36rem] w-full text-sm">
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
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadSuggestions}
              disabled={suggesting || preferences.length === 0}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-fill disabled:opacity-50"
            >
              {suggesting ? "Suggesting…" : "Suggest pairings"}
            </button>
            <button
              type="button"
              onClick={addRoom}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-fill"
            >
              Add room
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {(!meetHasEnded || unassigned.length > 0) && (
        <section
          aria-label="Unassigned swimmers"
          onDragOver={
            meetHasEnded
              ? undefined
              : (event) => handleDragOver(event, "unassigned")
          }
          onDragLeave={
            meetHasEnded
              ? undefined
              : (event) => handleDragLeave(event, "unassigned")
          }
          onDrop={meetHasEnded ? undefined : handleUnassignedDrop}
          onClick={() => {
            if (!meetHasEnded && selectedAthleteId) {
              unassignAthlete(selectedAthleteId)
            }
          }}
          onKeyDown={(event) => {
            if (
              !meetHasEnded &&
              selectedAthleteId &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault()
              unassignAthlete(selectedAthleteId)
            }
          }}
          role={!meetHasEnded && selectedAthleteId ? "button" : undefined}
          tabIndex={!meetHasEnded && selectedAthleteId ? 0 : undefined}
          className={`rounded-xl border p-3 transition-colors sm:p-4 ${
            activeDropTarget === "unassigned"
              ? "border-primary bg-primary/10"
              : "border-border bg-fill-secondary"
          } ${
            !meetHasEnded && selectedAthleteId
              ? "cursor-pointer"
              : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Unassigned swimmers
              </h3>
              {!meetHasEnded && (
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  Drag swimmers into a room, or select a swimmer and choose a destination.
                </p>
              )}
            </div>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-foreground-secondary">
              {unassigned.length}
            </span>
          </div>
          {unassigned.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["M", "F"] as const).map((gender) => {
                const swimmers = unassignedByGender[gender]
                if (swimmers.length === 0) return null
                return (
                  <section
                    key={gender}
                    aria-label={gender === "M" ? "Unassigned men" : "Unassigned women"}
                    className="rounded-lg bg-background/70 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                        {gender === "M" ? "Men" : "Women"}
                      </h4>
                      <span className="rounded-full bg-fill-secondary px-2 py-0.5 text-xs font-medium text-foreground-secondary">
                        {swimmers.length}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {swimmers.map((athlete) => (
                        <button
                          key={athlete.id}
                          type="button"
                          draggable={!meetHasEnded}
                          onDragStart={(event) =>
                            handleAthleteDragStart(event, athlete.id)
                          }
                          onDragEnd={endDrag}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!meetHasEnded) {
                              setSelectedAthleteId((current) =>
                                current === athlete.id ? null : athlete.id
                              )
                            }
                          }}
                          aria-pressed={selectedAthleteId === athlete.id}
                          className={`rounded-full border px-2.5 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                            selectedAthleteId === athlete.id
                              ? "border-primary bg-primary text-primary-text"
                              : "border-border bg-background text-foreground-secondary"
                          } ${
                            !meetHasEnded
                              ? "cursor-grab active:cursor-grabbing"
                              : "cursor-default"
                          }`}
                          >
                            {athlete.name}
                          </button>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-foreground-secondary">
              All swimmers are assigned.
            </p>
          )}
        </section>
      )}

      {rooms.length > 0 && (
        <section aria-label="Room assignments" className="grid gap-3 md:grid-cols-2">
          {rooms.map((room, roomIndex) => {
            const target = `room-${roomIndex}`
            const isDropTarget = activeDropTarget === target
            const roomGender = genderOfRoom(room)
            const selectedAthleteCanJoin =
              !selectedAthleteId ||
              canAssignAthleteToRoom(selectedAthleteId, room)
            const isIncompatibleSelection =
              !!selectedAthleteId && !selectedAthleteCanJoin
            return (
              <div
                key={roomIndex}
                onDragOver={
                  meetHasEnded
                    ? undefined
                    : (event) => {
                        const athleteId =
                          draggedAthleteId ||
                          event.dataTransfer.getData("text/plain")
                        if (
                          !athleteId ||
                          canAssignAthleteToRoom(athleteId, room)
                        ) {
                          handleDragOver(event, target)
                        }
                      }
                }
                onDragLeave={
                  meetHasEnded
                    ? undefined
                    : (event) => handleDragLeave(event, target)
                }
                onDrop={
                  meetHasEnded
                    ? undefined
                    : (event) => handleRoomDrop(event, roomIndex)
                }
                onClick={() => {
                  if (!meetHasEnded && selectedAthleteId && selectedAthleteCanJoin) {
                    moveAthleteToRoom(selectedAthleteId, roomIndex)
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    !meetHasEnded &&
                    selectedAthleteId &&
                    selectedAthleteCanJoin &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault()
                    moveAthleteToRoom(selectedAthleteId, roomIndex)
                  }
                }}
                role={!meetHasEnded && selectedAthleteId && selectedAthleteCanJoin ? "button" : undefined}
                tabIndex={!meetHasEnded && selectedAthleteId && selectedAthleteCanJoin ? 0 : undefined}
                className={`rounded-xl border p-3 transition-colors sm:p-4 ${
                  isDropTarget
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                } ${
                  !meetHasEnded && selectedAthleteId && selectedAthleteCanJoin
                    ? "cursor-pointer"
                    : isIncompatibleSelection
                      ? "cursor-not-allowed opacity-60"
                      : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      Room {formatRoomLabel(roomIndex + 1)}
                    </h3>
                    {roomGender && (
                      <span className="rounded-full bg-fill-secondary px-2 py-0.5 text-xs font-medium text-foreground-secondary">
                        {roomGender === "M" ? "Men" : "Women"}
                      </span>
                    )}
                  </div>
                  {!meetHasEnded && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeRoom(roomIndex)
                      }}
                      className="inline-flex items-center justify-center rounded-md p-2 text-foreground-tertiary transition-colors hover:bg-red-50 hover:text-error focus:outline-none focus:ring-2 focus:ring-primary/50 dark:hover:bg-red-950/30"
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
                  )}
                </div>
                <div
                  className={`mt-3 min-h-20 rounded-lg border border-dashed p-2 transition-colors ${
                    isDropTarget
                      ? "border-primary bg-background/70"
                      : "border-border bg-fill-secondary/50"
                  }`}
                >
                  {room.athleteIds.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {room.athleteIds.map((athleteId) => {
                        const athleteName = athleteNameById.get(athleteId) ?? athleteId
                        return (
                          <button
                            key={athleteId}
                            draggable={!meetHasEnded}
                            onDragStart={(event) => handleAthleteDragStart(event, athleteId)}
                            onDragEnd={endDrag}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (!meetHasEnded) {
                                setSelectedAthleteId((current) =>
                                  current === athleteId ? null : athleteId
                                )
                              }
                            }}
                            aria-pressed={selectedAthleteId === athleteId}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                              selectedAthleteId === athleteId
                                ? "border-primary bg-primary text-primary-text"
                                : "border-border bg-background text-foreground"
                            } ${
                              !meetHasEnded
                                ? "cursor-grab active:cursor-grabbing"
                                : "cursor-default"
                            }`}
                          >
                            {athleteName}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="flex min-h-14 items-center justify-center text-sm text-foreground-secondary">
                      {!meetHasEnded ? "Drop swimmers here" : "No swimmers assigned"}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}
      {!meetHasEnded && (
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving || publishing}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-fill disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={togglePublish}
              disabled={publishing || saving || (!published && !hasAssignments)}
              className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-text transition-colors hover:bg-primary-hover disabled:opacity-50"
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
              <span className="col-span-2 justify-self-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Published
              </span>
            )}
        </div>
      )}
    </div>
  )
}
