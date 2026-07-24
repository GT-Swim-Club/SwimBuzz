import { prisma } from "./swimbuzz/src/lib/prisma"

async function findManualEntries() {
  const meetName = "Sting 'Em Classic"
  const meet = await prisma.meet.findFirst({ where: { name: meetName } })
  if (!meet) {
    console.log(`Meet "${meetName}" not found.`)
    return
  }

  const resultStatusesSummary = meet.resultStatusesSummary as { entries: Array<{ athleteName: string, event: string, manual?: boolean }> } | null
  if (!resultStatusesSummary || !resultStatusesSummary.entries) {
    console.log("No result entries found.")
    return
  }

  const manualEntries = resultStatusesSummary.entries.filter(e => e.manual)
  console.log(`Found ${manualEntries.length} manual entries:`)
  manualEntries.forEach(e => console.log(`- ${e.athleteName}: ${e.event}`))
}

findManualEntries().finally(() => prisma.$disconnect())
