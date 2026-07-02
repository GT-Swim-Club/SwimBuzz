import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { Gender } from "@prisma/client"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
const TEAM_ID = process.env.SWIMCLOUD_TEAM_ID ?? "10004130"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { year, gender } = await req.json()

  const res = await fetchScraper(
    `${SCRAPER_URL}/roster?team_id=${TEAM_ID}&year=${year}&gender=${gender}`
  )
  if (!res.ok) {
    return NextResponse.json({ error: "Scraper failed" }, { status: 502 })
  }

  const roster = await res.json()
  console.log("roster sample:", roster[0]) // 👈 check terminal
    console.log("roster length:", roster.length)
  let created = 0
  let skipped = 0

  try {
    for (const swimmer of roster) {
        const swimCloudId = parseInt(swimmer.swimmer_ID)
        const [firstName, ...rest] = swimmer.swimmer_name.trim().split(" ")
        const lastName = rest.join(" ")
      
        let athlete = await prisma.athlete.findFirst({ where: { swimCloudId } })

        if (!athlete) {
          const user = await prisma.user.upsert({
            where: { email: `${swimCloudId}@swimcloud.placeholder` },
            update: {},
            create: {
              email: `${swimCloudId}@swimcloud.placeholder`,
              name: swimmer.swimmer_name,
              role: "ATHLETE",
            },
          })
        
          athlete = await prisma.athlete.create({
            data: {
              userId: user.id,
              firstName,
              lastName,
              swimCloudId,
              gender: gender === "M" ? Gender.M : Gender.F,
              seasons: [year],
            },
          })
          created++
        } else {
          // add this year to seasons if not already there
          if (!athlete.seasons.includes(year)) {
            await prisma.athlete.update({
              where: { id: athlete.id },
              data: { seasons: { push: year } },
            })
          }
          skipped++
        }
      }
    } catch (err) {
    console.error("Sync error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ created, skipped, total: roster.length })
}