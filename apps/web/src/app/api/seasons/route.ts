import { NextResponse } from "next/server"
import { listSeasons } from "@/lib/season-store"

export async function GET() {
  return NextResponse.json(await listSeasons(), {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" }})
}
