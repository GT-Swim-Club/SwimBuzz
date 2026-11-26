import { Gender } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { relayDraftsOf, withRelayDrafts } from "@/lib/meet/relay-drafts"
import {
  effectiveRelayRound,
  isRelayResultsSummary,
  relayEventKey,
  sanitizeRelaySplitTime,
  type RelayGender,
} from "@/lib/meet/relay-results"
import {
  isBuilderRelayLineup,
  relayEventRounds,
  relayPrelimsFinalsOf,
  relayRoundsKey,
} from "@/lib/meet/relay-rounds"
import { deleteRelayLeadoffSwim } from "@/lib/meet/relay-leadoff-sync"
import { syncMeetRelaySplitSwims } from "@/lib/meet/relay-split-sync"
import { notifyRelayLineupChanges } from "@/lib/notifications/relay-lineup-notify"

/** `prelimsFinals` from a relay builder save's body; null when absent. */
export function parsePrelimsFinalsChoice(body: unknown): boolean | null {
  if (!body || typeof body !== "object") return null
  const value = (body as Record<string, unknown>).prelimsFinals
  return typeof value === "boolean" ? value : null
}

/**
 * Save a coach's "Prelims & finals" choice for a relay event (Women's and Men's share it), after
 * the builder's own save of `gender`. Ignored when results already decide it. Turning it off makes
 * the other gender's relay a timed final too: its draft's own finals lineup is dropped, and the
 * lineups the builder published for it lose their finals relays while prelims becomes the one
 * lineup. Relays with results are never touched.
 */
export async function saveRelayPrelimsFinalsChoice(
  meetId: string,
  event: string,
  gender: string,
  on: boolean,
  userId: string
): Promise<void> {
  const meet = await prisma.meet.findUnique({ where: { id: meetId } })
  if (!meet) return
  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, gender: true },
  })
  const athleteGenders = new Map<string, RelayGender>(roster.map((a) => [a.id, a.gender === Gender.F ? "F" : "M"]))
  if (relayEventRounds(meet, event, gender, athleteGenders).locked) return

  const choices = { ...relayPrelimsFinalsOf(meet.relayPrelimsFinals), [relayRoundsKey(event, gender)]: on }
  if (on || gender === "X") {
    await prisma.meet.update({ where: { id: meetId }, data: { relayPrelimsFinals: { events: choices } } })
    return
  }

  // Off: the other gender of the event becomes a timed final too.
  const sibling: RelayGender = gender === "F" ? "M" : "F"
  const key = relayEventKey(event)
  const drafts = relayDraftsOf(meet.relayDrafts)
  const nextDrafts = drafts.map((draft) => {
    if (draft.gender !== sibling || relayEventKey(draft.event) !== key || !draft.finalsTeams) return draft
    const rest = { ...draft }
    delete rest.finalsTeams
    return rest
  })
  const draftsChanged = nextDrafts.some((draft, i) => draft !== drafts[i])

  const entries = isRelayResultsSummary(meet.relayResultsSummary) ? meet.relayResultsSummary.entries : []
  const isSiblingLineup = (entry: (typeof entries)[number]) => isBuilderRelayLineup(entry, event, sibling, athleteGenders)
  /** Lead-off swims to delete: a split on a relay that is removed or changes round. */
  const leadoffs: { event: string; athleteId: string; round: "P" | "F" }[] = []
  const nextEntries: typeof entries = []
  let relaysChanged = false
  for (const entry of entries) {
    const round = effectiveRelayRound(entry)
    if (!isSiblingLineup(entry) || round === "") {
      nextEntries.push(entry)
      continue
    }
    relaysChanged = true
    const leg1 = entry.relaySwimmers?.find((s) => s.leg === 1)
    if (leg1?.athleteId && sanitizeRelaySplitTime(leg1.splitTime)) {
      leadoffs.push({ event: entry.event, athleteId: leg1.athleteId, round })
    }
    if (round === "F") continue
    // Prelims becomes the one lineup; a split recorded for prelims no longer applies.
    nextEntries.push({
      ...entry,
      relayRound: "",
      ...(entry.relaySwimmers
        ? { relaySwimmers: entry.relaySwimmers.map((swimmer) => ({ ...swimmer, splitTime: undefined })) }
        : {}),
    })
  }

  await prisma.meet.update({
    where: { id: meetId },
    data: {
      relayPrelimsFinals: { events: choices },
      ...(draftsChanged ? { relayDrafts: withRelayDrafts(meet.relayDrafts, nextDrafts) } : {}),
      ...(relaysChanged ? { relayResultsSummary: { entries: nextEntries } } : {}),
    },
  })
  if (!relaysChanged) return
  notifyRelayLineupChanges({ meetId, before: meet.relayResultsSummary, after: nextEntries, actorUserId: userId })
  for (const leadoff of leadoffs) {
    await deleteRelayLeadoffSwim(meet, leadoff.event, leadoff.athleteId, leadoff.round, sibling)
  }
  if (leadoffs.length > 0) await syncMeetRelaySplitSwims(meetId)
}
