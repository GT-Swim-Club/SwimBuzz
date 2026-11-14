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
const BODY_PREFIX = "You're on "

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

/** "200 Free Relay A, leg 2" (+ " (prelims)" / " (finals)"). */
function legPhrase(entry: SheetEntry, leg: number): string {
  const round = effectiveRelayRound(entry)
  const roundLabel = round === "P" ? " (prelims)" : round === "F" ? " (finals)" : ""
  return `${entry.event} ${displayRelayLetter(entry.relayLetter)}, leg ${leg}${roundLabel}`
}

function bodyFor(phrases: string[]): string {
  return `${BODY_PREFIX}${phrases.join("; ")}`
}

function phrasesOf(body: string): string[] {
  return body.startsWith(BODY_PREFIX) ? body.slice(BODY_PREFIX.length).split("; ").filter(Boolean) : []
}

/**
 * After a relay lineup write: tell each athlete in a lineup that is new or changed which relay and
 * leg they're on — only for a relay and leg they haven't been told about for this meet, so
 * re-publishing an unchanged lineup tells no one. Runs once the response is sent.
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

    const phrasesByAthlete = new Map<string, string[]>()
    for (const entry of afterLineups) {
      if (beforeByKey.get(keyOf(entry)) === lineupSignature(entry)) continue
      for (const swimmer of entry.relaySwimmers ?? []) {
        if (!swimmer.athleteId) continue
        const list = phrasesByAthlete.get(swimmer.athleteId) ?? []
        list.push(legPhrase(entry, swimmer.leg))
        phrasesByAthlete.set(swimmer.athleteId, list)
      }
    }
    if (phrasesByAthlete.size === 0) return

    const recipients = (
      await athleteUserIdsWithPreference([...phrasesByAthlete.keys()], "relayLineups")
    ).filter((r) => r.userId !== input.actorUserId)
    if (recipients.length === 0) return

    const meet = await prisma.meet.findUnique({ where: { id: input.meetId }, select: { name: true } })
    if (!meet) return
    const title = `Relay lineup: ${meet.name}`
    const href = `${await meetHrefForId(input.meetId)}/relays`
    const refKey = `${meetRefKey(input.meetId)}|relay`
    // Earlier lineup notices for this meet: a relay and leg someone was already told about (a
    // lineup unpublished to a draft and published again unchanged) isn't announced twice.
    const earlier = await prisma.notification.findMany({
      where: {
        type: NotificationType.RELAY_LINEUP,
        refKey,
        userId: { in: recipients.map((r) => r.userId) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, body: true, readAt: true, createdAt: true },
    })
    const toldByUser = new Map<string, Set<string>>()
    const recentByUser = new Map<string, (typeof earlier)[number]>()
    const coalesceSince = Date.now() - COALESCE_MS
    for (const n of earlier) {
      const told = toldByUser.get(n.userId) ?? new Set<string>()
      for (const phrase of phrasesOf(n.body)) told.add(phrase)
      toldByUser.set(n.userId, told)
      if (!n.readAt && n.createdAt.getTime() >= coalesceSince && !recentByUser.has(n.userId)) {
        recentByUser.set(n.userId, n)
      }
    }

    const fresh: { userId: string; body: string }[] = []
    for (const r of recipients) {
      const told = toldByUser.get(r.userId)
      const phrases = (phrasesByAthlete.get(r.athleteId) ?? []).filter((p) => !told?.has(p))
      if (phrases.length === 0) continue
      const existing = recentByUser.get(r.userId)
      if (existing) {
        // Already told a moment ago (and pushed then): fold this change into that notice.
        const merged = [...new Set([...phrasesOf(existing.body), ...phrases])]
        await prisma.notification.update({
          where: { id: existing.id },
          data: { body: bodyFor(merged), seenAt: null, createdAt: new Date() },
        })
      } else {
        fresh.push({ userId: r.userId, body: bodyFor(phrases) })
      }
    }
    if (fresh.length === 0) return
    await prisma.notification.createMany({
      data: fresh.map((f) => ({
        userId: f.userId,
        type: NotificationType.RELAY_LINEUP,
        title,
        body: f.body,
        href,
        refKey,
      })),
    })
    await sendExpoPushPerUser(fresh.map((f) => ({ userId: f.userId, title, body: f.body, href })))
  })
}
