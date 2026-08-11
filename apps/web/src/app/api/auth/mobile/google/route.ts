import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { issueMobileTokens, verifyGoogleIdToken } from "@/lib/mobile-auth"
import { Role } from "@prisma/client"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const idToken = String(body.idToken ?? "")
  if (!idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 })
  }

  const google = await verifyGoogleIdToken(idToken)
  if (!google) {
    return NextResponse.json({ error: "Invalid Google token" }, { status: 401 })
  }

  let user = await prisma.user.findUnique({ where: { email: google.email } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: google.email,
        name: google.name ?? google.email,
        image: google.picture,
        role: Role.COACH,
        emailVerified: new Date(),
      },
    })
  }

  // Ensure Account row exists for Google provider (mirrors NextAuth adapter).
  const existingAccount = await prisma.account.findFirst({
    where: { provider: "google", providerAccountId: google.sub },
  })
  if (!existingAccount) {
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: google.sub,
      },
    })
  }

  const tokens = await issueMobileTokens(user)
  return NextResponse.json(tokens)
}
