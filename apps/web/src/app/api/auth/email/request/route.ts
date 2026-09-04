import { NextResponse } from "next/server"
import { requestEmailLoginCode } from "@/lib/auth/email-login"

export async function POST(req: Request) {
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const result = await requestEmailLoginCode(body.email ?? "")
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
