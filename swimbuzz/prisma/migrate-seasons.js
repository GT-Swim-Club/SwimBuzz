require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const meets = await prisma.meet.findMany({
    select: { season: true },
    distinct: ['season'],
  })
  
  const seasons = Array.from(new Set(meets.map(m => m.season)))
  
  console.log("Seasons found:", seasons)

  for (const label of seasons) {
    if (!label) continue
    await prisma.season.upsert({
      where: { label },
      update: {},
      create: { label },
    })
  }
  console.log("Seasons migrated to database.")
}

main().catch(console.error).finally(() => prisma.$disconnect())
