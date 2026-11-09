/**
 * Load the club's records sheet into TeamRecord (year-only, source "seed"), linking names to roster
 * athletes where exactly one matches, then sync so imported meets that beat a seeded record take
 * over. Skips any event that already has a record, so it's safe to re-run. Run after `prisma db push`:
 *   node scripts/seed-team-records.mjs
 */
import { register } from "node:module"

register("./ts-source-loader.mjs", import.meta.url)

const { prisma } = await import("../src/lib/prisma.ts")
const { linkRecordSwimmers } = await import("../src/lib/records/records.ts")
const { syncTeamRecords } = await import("../src/lib/records/record-sync.ts")
const { parseRecordTime } = await import("../../../packages/shared/src/team-records.ts")

/** [event, time, year, swimmer] — "(R)" in the sheet marks a relay lead-off. */
const WOMEN = [
  ["25 Free", "11.69", 2023, "Hannah Collerette"],
  ["50 Free", "22.48", 2025, "Delaney Carlton"],
  ["100 Free", "50.83", 2024, "Delaney Carlton"],
  ["200 Free", "1:53.12", 2019, "Lindsay Knapp"],
  ["500 Free", "5:05.97", 2019, "Ally Nastasi"],
  ["1000 Free", "10:31.49", 2019, "Ally Nastasi"],
  ["1650 Free", "18:40.99", 2005, "Alex Kennedy"],
  ["25 Back", "14.56", 2023, "Natalia Celis"],
  ["50 Back", "25.80", 2019, "Alex Rieger (R)"],
  ["100 Back", "56.14", 2025, "Rachel Fulton"],
  ["200 Back", "2:06.24", 2019, "Rebecca Durham"],
  ["25 Fly", "11.53", 2023, "Sarah Sundius"],
  ["50 Fly", "24.47", 2025, "Delaney Carlton"],
  ["100 Fly", "55.52", 2025, "Gabby Freund"],
  ["200 Fly", "2:09.05", 2018, "Ellie Ridgeway"],
  ["25 Breast", "15.34", 2023, "Sarah Sundius"],
  ["50 Breast", "31.78", 2021, "Abbie Cochell"],
  ["100 Breast", "1:08.94", 2018, "Abbie Cochell"],
  ["200 Breast", "2:28.40", 2022, "Emiley Yie"],
  ["100 IM", "57.99", 2019, "Alex Rieger"],
  ["200 IM", "2:09.13", 2019, "Rebecca Durham"],
  ["400 IM", "4:32.94", 2019, "Ally Nastasi"],
]

const MEN = [
  ["25 Free", "9.93", 2023, "James White"],
  ["50 Free", "20.36", 2024, "James White"],
  ["100 Free", "44.74", 2024, "James White"],
  ["200 Free", "1:38.65", 2026, "Liam Long"],
  ["500 Free", "4:32.19", 2026, "Ryan Altera"],
  ["1000 Free", "9:27.83", 2026, "Ryan Altera"],
  ["1650 Free", "16:43.10", 2024, "Ryan Altera"],
  ["25 Back", "11.69", 2023, "Louis Cardot"],
  ["50 Back", "22.29", 2026, "Christian Smith"],
  ["100 Back", "48.60", 2026, "Christian Smith"],
  ["200 Back", "1:47.09", 2026, "Christian Smith"],
  ["25 Fly", "10.46", 2023, "John Matthews"],
  ["50 Fly", "22.26", 2016, "Taylor Wilson"],
  ["100 Fly", "50.26", 2011, "Noah Copeland"],
  ["200 Fly", "1:51.53", 2026, "Christian Smith"],
  ["25 Breast", "12.82", 2023, "Andrew Rohweder"],
  ["50 Breast", "24.88", 2011, "Mikey Malul"],
  ["100 Breast", "55.84", 2023, "Matthew Steele"],
  ["200 Breast", "2:04.39", 2024, "Yona Rubin"],
  ["100 IM", "50.96", 2026, "Liam Long"],
  ["200 IM", "1:50.98", 2025, "Liam Long"],
  ["400 IM", "3:57.89", 2026, "Ryan Altera"],
]

/** [gender, event, time, year, legs 1–4] — "" where the sheet has "-". */
const RELAYS = [
  ["F", "200 Free Relay", "1:35.35", 2026, ["Sara Ukic", "Rachel Fulton", "Caroline Porterfield", "Sabina Mryzglod"]],
  ["F", "400 Free Relay", "3:30.87", 2025, ["Iris Ochoa", "Audrey Munger", "Rachel Fulton", "Delaney Carlton"]],
  ["F", "800 Free Relay", "7:43.46", 2019, ["Alex Rieger", "Ellie Ridgeway", "Rebecca Durham", "Lindsay Knapp"]],
  ["F", "200 Medley Relay", "1:45.83", 2025, ["Rachel Fulton", "Alice Spaulding", "Gabby Freund", "Delaney Carlton"]],
  ["F", "400 Medley Relay", "3:54.79", 2019, ["Alex Rieger", "Rebecca Durham", "Ellie Ridgeway", "Lindsay Knapp"]],
  ["M", "200 Free Relay", "1:22.52", 2025, ["Patrick Lister", "Liam Long", "Josh Hanks", "Keller White"]],
  ["M", "400 Free Relay", "3:03.07", 2024, ["Andrew Schnupp", "Matthew Pianoto", "Vojtech Kupka", "James White"]],
  ["M", "800 Free Relay", "6:44.06", 2026, ["Christian Smith", "Ryan Altera", "Nolan Mackay", "Liam Long"]],
  ["M", "200 Medley Relay", "1:31.18", 2011, ["", "", "", ""]],
  ["M", "400 Medley Relay", "3:24.51", 2011, ["", "", "", ""]],
  ["X", "200 Free Relay", "1:27.33", 2025, ["Keller White", "Patrick Lister", "Rachel Fulton", "Delaney Carlton"]],
]

const rows = [
  ...WOMEN.map(([event, time, year, name]) => ["F", event, time, year, [name]]),
  ...MEN.map(([event, time, year, name]) => ["M", event, time, year, [name]]),
  ...RELAYS,
]

let created = 0
for (const [gender, event, time, year, names] of rows) {
  const timeMs = parseRecordTime(time)
  if (!timeMs) throw new Error(`Bad time ${time} for ${gender} ${event}`)
  if (await prisma.teamRecord.count({ where: { course: "SCY", gender, event } })) {
    console.log(`skip  ${gender} ${event} (already has a record)`)
    continue
  }
  const leadoff = names.length === 1 && names[0].endsWith(" (R)")
  const swimmers = names.map((name) => ({ name: name.replace(/ \(R\)$/, "") }))
  await linkRecordSwimmers(swimmers, gender)
  await prisma.teamRecord.create({
    data: { course: "SCY", gender, event, timeMs, year, swimmers, leadoff, source: "seed" },
  })
  created++
  const linked = swimmers.filter((s) => s.athleteId).length
  console.log(`seed  ${gender} ${event} ${time} ${year} (${linked}/${swimmers.length} linked)`)
}

await syncTeamRecords()
const promoted = await prisma.teamRecord.findMany({
  where: { source: "meet", dismissed: false },
  orderBy: [{ gender: "asc" }, { event: "asc" }],
})
console.log(`\n${created} records seeded. Records now set at imported meets:`)
for (const r of promoted) {
  console.log(`  ${r.gender} ${r.event}: ${r.timeMs / 1000}s · ${r.meetName} · ${r.date?.toISOString().slice(0, 10)}`)
}
await prisma.$disconnect()
