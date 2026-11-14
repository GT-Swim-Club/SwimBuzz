import type { RelayLineup } from "@swimbuzz/shared"
import { lineupKey, settingsKey, type RelaySlotData } from "@/lib/meet/relay-builder"
import { relayEditLockHolderName, type RelayEditLockInfo } from "@/lib/meet/relay-edit-lock-shared"

/**
 * What a relay event holds, for telling whether someone else saved it since the builder opened:
 * the published lineups (team, round, swimmers, results) and the draft's lineups and settings.
 * Keys, seed formatting and save times are left out, so a save of our own reads the same whether
 * the summary shows it optimistically or as the server stored it.
 */
export function slotSignature(data: RelaySlotData): string {
  const published = data.published
    .map((relay) => [
      relay.round,
      relay.letter,
      relay.manual,
      relay.resultTime,
      relay.place,
      relay.legs.map((leg) => leg.athleteId ?? leg.name).join(","),
    ])
    .map((parts) => JSON.stringify(parts))
    .sort()
  const draft = data.draft
    ? [
        data.draft.published === true,
        lineupKey(data.draft.teams),
        data.draft.finalsTeams ? lineupKey(data.draft.finalsTeams) : null,
        data.draft.settings ? settingsKey(data.draft.settings) : null,
      ]
    : null
  return JSON.stringify({ published, draft })
}

/**
 * A lock went away or changed hands between two polls of the summary — someone finished editing
 * (and likely saved), so the summary's lineups may be out of date.
 */
export function locksChanged(previous: RelayEditLockInfo[], next: RelayEditLockInfo[]): boolean {
  const holders = new Map(next.map((lock) => [lock.slot, lock.lockedBy?.id ?? null]))
  return previous.some((lock) => !holders.has(lock.slot) || holders.get(lock.slot) !== (lock.lockedBy?.id ?? null))
}

/** A builder-published relay athletes can see now: saving a draft takes it down. */
export function isLiveBuilderLineup(relay: RelayLineup): boolean {
  return relay.manual && relay.resultTime == null && relay.place == null
}

/**
 * What saving a draft takes down, for messages: "the published lineup", or for a prelims & finals
 * relay the round(s) still published ("the published finals lineup"). Null when nothing the
 * builder published is live.
 */
export function unpublishedLineupPhrase(published: RelayLineup[], prelimsFinals: boolean): string | null {
  const live = published.filter(isLiveBuilderLineup)
  if (live.length === 0) return null
  if (!prelimsFinals) return "the published lineup"
  const rounds = new Set(live.map((relay) => relay.round))
  // A round-less lineup is both rounds' while finals follows prelims.
  const prelims = rounds.has("P") || rounds.has("")
  const finals = rounds.has("F") || rounds.has("")
  if (prelims && finals) return "the published prelims and finals lineups"
  return prelims ? "the published prelims lineup" : "the published finals lineup"
}

/** "Jane Doe is editing" / "Open in another tab" under a relay event on the summary. */
export function editorLabel(lock: RelayEditLockInfo): string {
  return lock.lockedByMe ? "Open in another tab" : `${relayEditLockHolderName(lock)} is editing`
}

/** "3:42 PM" today, else "Nov 9" — when a draft was saved, for the builder's status line. */
/** "Jane Doe · Nov 11, 3:42 PM" — who saved a lineup and when, for the builder's menu. */
export function savedByLine(savedBy: string | null | undefined, savedAt: string): string {
  const date = new Date(savedAt)
  const when = Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  return [savedBy?.trim() || null, when].filter(Boolean).join(" · ")
}

export function savedAtLabel(savedAt: string, now = new Date()): string | null {
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return null
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
