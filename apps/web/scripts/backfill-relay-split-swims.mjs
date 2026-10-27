/**
 * Save every meet's existing relay leg 2–4 splits as relay split swims (tagged SPLIT|…), which
 * relay-split-sync.ts keeps up to date from here on. Safe to re-run. Run after `prisma db push`:
 *   node scripts/backfill-relay-split-swims.mjs
 */
import { register } from "node:module"

register("./ts-source-loader.mjs", import.meta.url)

const { prisma } = await import("../src/lib/prisma.ts")
const { isRelayResultsSummary } = await import("../src/lib/meet/relay-results.ts")
const { syncMeetRelaySplitSwims } = await import("../src/lib/meet/relay-split-sync.ts")
const { loadRelaySplits } = await import("../src/lib/meet/relay-splits.ts")

const meets = await prisma.meet.findMany({
  select: { id: true, name: true, relayResultsSummary: true },
  orderBy: { startsAt: "asc" },
})
const withRelays = meets.filter(
  (meet) => isRelayResultsSummary(meet.relayResultsSummary) && meet.relayResultsSummary.entries.length > 0
)

for (const meet of withRelays) {
  await syncMeetRelaySplitSwims(meet.id)
  console.log(`Synced ${meet.name}`)
}
console.log(`\n${withRelays.length} meets with relays; ${(await loadRelaySplits()).length} relay split swims now.`)
await prisma.$disconnect()
