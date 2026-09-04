import { NextResponse } from "next/server"

/** Authorize Vercel Cron or external cron via Bearer CRON_SECRET. */
export function requireCronSecret(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    )
  }

  const auth = req.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return null

  // Vercel Cron sends this header on Hobby/Pro when CRON_SECRET is set in project.
  const cronHeader = req.headers.get("x-vercel-cron-secret")
  if (cronHeader && cronHeader === secret) return null

  // Vercel automatically sends Authorization: Bearer <CRON_SECRET> when configured.
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
