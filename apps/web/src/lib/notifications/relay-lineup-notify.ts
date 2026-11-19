import { Gender, NotificationType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { SheetEntry } from "@/lib/meet/meet-sheet-summary"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  isRelayResultsSummary,
  relayTeamKey,
  relayTeamTime,
  type RelayGender,
} from "@/lib/meet/relay-results"
import { meetHrefForId } from "@/lib/slug"
import { runAfterResponse } from "@/lib/notifications/after-response"
import { athleteUserIdsWithPreference } from "@/lib/notifications/notifications"
import { meetRefKey } from "@/lib/notifications/notification-refs"
import { sendExpoPushPerUser } from "@/lib/notifications/push"

/** Several publishes in a row (Publish all, a coach's edits) fold into one notice per athlete. */
const COALESCE_MS = 15 * 60 * 1000
/** What someone was last told about a relay they're no longer on. */
const OFF_STATE = "off"
const ON_PREFIX = "You're on "
const OFF_PREFIX = "You're off "
const PART_SEPARATOR = ". "

/** Published lineups only: a relay with a team time is a result, not a lineup. */
function lineupEntries(entries: SheetEntry[]): SheetEntry[] {
  return entries.filter(
    (e) => !relayTeamTime(e) && (e.relaySwimmers ?? []).some((s) => Boolean(s.athleteId))
  )
}

function lineupSignature(entry: SheetEntry): string {
  return [...(entry.relaySwimmers ?? [])]
    .sort((a, b) => a.leg - b.leg)
    .map((s) => `${s.leg}:${s.athleteId ?? s.name}`)
    .join(",")
}

function roundLabelOf(entry: SheetEntry): string {
  const round = effectiveRelayRound(entry)
  return round === "P" ? " (prelims)" : round === "F" ? " (finals)" : ""
}

/** "200 Free Relay A, leg 2" (+ " (prelims)" / " (finals)"). */
function legPhrase(entry: SheetEntry, leg: number): string {
  return `${entry.event} ${displayRelayLetter(entry.relayLetter)}, leg ${leg}${roundLabelOf(entry)}`
}

/** "200 Free Relay A" (+ round) — the relay alone, for "You're off …". */
function relayPhrase(entry: SheetEntry): string {
  return `${entry.event} ${displayRelayLetter(entry.relayLetter)}${roundLabelOf(entry)}`
}

/** The relay a "You're on" phrase names: "200 Free Relay A, leg 2 (prelims)" → "200 Free Relay A (prelims)". */
function relayOfLegPhrase(phrase: string): string {
  return phrase.replace(/, leg \d+/, "")
}

type LineupNotice = { on: string[]; off: string[] }

/** "You're on 200 Free Relay B, leg 3. You're off 200 Free Relay A" — either half may be absent. */
function bodyFor(notice: LineupNotice): string {
  const parts: string[] = []
  if (notice.on.length) parts.push(`${ON_PREFIX}${notice.on.join("; ")}`)
  if (notice.off.length) parts.push(`${OFF_PREFIX}${notice.off.join("; ")}`)
  return parts.join(PART_SEPARATOR)
}

function noticeOf(body: string): LineupNotice {
  const notice: LineupNotice = { on: [], off: [] }
  for (const part of body.split(PART_SEPARATOR)) {
    if (part.startsWith(ON_PREFIX)) notice.on.push(...part.slice(ON_PREFIX.length).split("; ").filter(Boolean))
    else if (part.startsWith(OFF_PREFIX)) notice.off.push(...part.slice(OFF_PREFIX.length).split("; ").filter(Boolean))
  }
  return notice
}

/**
 * Fold newer changes into an earlier notice: joining a relay clears an earlier "off" for it, and
 * leaving one (or switching legs) drops the earlier "on" for it.
 */
function mergeNotices(earlier: LineupNotice, later: LineupNotice): LineupNotice {
  const laterOnRelays = new Set(later.on.map(relayOfLegPhrase))
  const laterOff = new Set(later.off)
  const on = earlier.on.filter((p) => {
    const relay = relayOfLegPhrase(p)
    return !laterOnRelays.has(relay) && !laterOff.has(relay)
  })
  const off = earlier.off.filter((r) => !laterOnRelays.has(r) && !laterOff.has(r))
  return { on: [...new Set([...on, ...later.on])], off: [...new Set([...off, ...later.off])] }
}

/**
 * After a relay lineup write: tell each athlete in a lineup that is new or changed which relay and
 * leg they're on, and each athlete taken off a published lineup that they're off it — only what
 * differs from what they were last told for this meet, so re-publishing an unchanged lineup tells
 * no one. A relay that leaves the published lineups altogether (unpublished to a draft, re-rounded,
 * or replaced by results) isn't a removal. Runs once the response is sent.
 */
export function notifyRelayLineupChanges(input: {
  meetId: string
  /** The meet's relayResultsSummary before the write. */
  before: unknown
  /** Its entries after the write. */
  after: SheetEntry[]
  actorUserId?: string | null
}): void {
  const before = isRelayResultsSummary(input.before) ? input.before.entries : []
  const beforeLineups = lineupEntries(before)
  const afterLineups = lineupEntries(input.after)
  if (afterLineups.length === 0) return

  runAfterResponse("relay lineup notification", async () => {
    const athleteIds = new Set<string>()
    for (const e of [...beforeLineups, ...afterLineups]) {
      for (const s of e.relaySwimmers ?? []) if (s.athleteId) athleteIds.add(s.athleteId)
    }
    const genders = new Map<string, RelayGender>(
      (
        await prisma.athlete.findMany({
          where: { id: { in: [...athleteIds] } },
          select: { id: true, gender: true },
        })
      ).map((a) => [a.id, a.gender === Gender.F ? "F" : "M"])
    )
    const keyOf = (e: SheetEntry) =>
      relayTeamKey(e.event, e.relayLetter, effectiveRelayRound(e), effectiveRelayGender(e, genders))
    const beforeByKey = new Map(beforeLineups.map((e) => [keyOf(e), lineupSignature(e)]))

    const changesByAthlete = new Map<string, LineupNotice>()
    const changesFor = (athleteId: string) => {
      const notice = changesByAthlete.get(athleteId) ?? { on: [], off: [] }
      changesByAthlete.set(athleteId, notice)
      return notice
    }
    const afterByKey = new Map(afterLineups.map((e) => [keyOf(e), e]))
    for (const entry of afterLineups) {
      if (beforeByKey.get(keyOf(entry)) === lineupSignature(entry)) continue
      for (const swimmer of entry.relaySwimmers ?? []) {
        if (swimmer.athleteId) changesFor(swimmer.athleteId).on.push(legPhrase(entry, swimmer.leg))
      }
    }
    // Taken off a relay that is still a published lineup.
    for (const entry of beforeLineups) {
      const now = afterByKey.get(keyOf(entry))
      if (!now) continue
      const stillOn = new Set((now.relaySwimmers ?? []).map((s) => s.athleteId).filter(Boolean))
      for (const swimmer of entry.relaySwimmers ?? []) {
        if (swimmer.athleteId && !stillOn.has(swimmer.athleteId)) {
          changesFor(swimmer.athleteId).off.push(relayPhrase(entry))
        }
      }
    }
    if (changesByAthlete.size === 0) return

    const recipients = (
      await athleteUserIdsWithPreference([...changesByAthlete.keys()], "relayLineups")
    ).filter((r) => r.userId !== input.actorUserId)
    if (recipients.length === 0) return

    const meet = await prisma.meet.findUnique({ where: { id: input.meetId }, select: { name: true } })
    if (!meet) return
    const title = `Relay lineup: ${meet.name}`
    const href = `${await meetHrefForId(input.meetId)}/relays`
    const refKey = `${meetRefKey(input.meetId)}|relay`
    // Earlier lineup notices for this meet, oldest first: what each person was last told about each
    // relay (a leg, or "off"), so a lineup unpublished to a draft and published again unchanged
    // isn't announced twice — but being put back on a relay after being taken off it is.
    const earlier = await prisma.notification.findMany({
      where: {
        type: NotificationType.RELAY_LINEUP,
        refKey,
        userId: { in: recipients.map((r) => r.userId) },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, body: true, readAt: true, createdAt: true },
    })
    const toldByUser = new Map<string, Map<string, string>>()
    const recentByUser = new Map<string, (typeof earlier)[number]>()
    const coalesceSince = Date.now() - COALESCE_MS
    for (const n of earlier) {
      const told = toldByUser.get(n.userId) ?? new Map<string, string>()
      const notice = noticeOf(n.body)
      for (const relay of notice.off) told.set(relay, OFF_STATE)
      for (const phrase of notice.on) told.set(relayOfLegPhrase(phrase), phrase)
      toldByUser.set(n.userId, told)
      if (!n.readAt && n.createdAt.getTime() >= coalesceSince) recentByUser.set(n.userId, n)
    }

    const fresh: { userId: string; body: string }[] = []
    const refreshed: { userId: string; body: string }[] = []
    for (const r of recipients) {
      const told = toldByUser.get(r.userId)
      const changes = changesByAthlete.get(r.athleteId) ?? { on: [], off: [] }
      const news: LineupNotice = {
        on: changes.on.filter((p) => told?.get(relayOfLegPhrase(p)) !== p),
        // Leaving a relay for another leg of it isn't "off" — the new leg is the news.
        off: changes.off.filter(
          (relay) => told?.get(relay) !== OFF_STATE && !changes.on.some((p) => relayOfLegPhrase(p) === relay)
        ),
      }
      if (news.on.length === 0 && news.off.length === 0) continue
      const existing = recentByUser.get(r.userId)
      if (existing) {
        // Already told a moment ago (and pushed then): fold this change into that notice — and
        // push again only for a removal, so no one is left thinking they still swim a relay.
        const body = bodyFor(mergeNotices(noticeOf(existing.body), news))
        await prisma.notification.update({
          where: { id: existing.id },
          data: { body, seenAt: null, createdAt: new Date() },
        })
        if (news.off.length) refreshed.push({ userId: r.userId, body })
      } else {
        fresh.push({ userId: r.userId, body: bodyFor(news) })
      }
    }
    if (fresh.length === 0 && refreshed.length === 0) return
    if (fresh.length) await prisma.notification.createMany({
      data: fresh.map((f) => ({
        userId: f.userId,
        type: NotificationType.RELAY_LINEUP,
        title,
        body: f.body,
        href,
        refKey,
      })),
    })
    await sendExpoPushPerUser(
      [...fresh, ...refreshed].map((f) => ({ userId: f.userId, title, body: f.body, href }))
    )
  })
}
