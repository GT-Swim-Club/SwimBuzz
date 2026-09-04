import { createHash, randomInt } from "crypto"
import { prisma } from "@/lib/prisma"
import {
  isPlaceholderEmail,
  normalizeGatechEmail,
} from "@/lib/auth/gatech-email"
import { sendEmail } from "@/lib/send-email"

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5

function hashCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${email}:${code}:${process.env.NEXTAUTH_SECRET ?? ""}`)
    .digest("hex")
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export type RequestLoginCodeResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

/** Find a roster user for a GT email (must exist, not a placeholder). */
export async function findRosterUserByGatechEmail(rawEmail: string) {
  const email = normalizeGatechEmail(rawEmail)
  if (!email) return null

  const user = await prisma.user.findUnique({
    where: { email },
    include: { athlete: { select: { id: true } } },
  })

  if (!user || isPlaceholderEmail(user.email)) return null
  // Roster = users created/imported as athletes (or linked to an athlete).
  if (!user.athlete) return null
  return user
}

export async function requestEmailLoginCode(
  rawEmail: string
): Promise<RequestLoginCodeResult> {
  const email = normalizeGatechEmail(rawEmail)
  if (!email) {
    return {
      ok: false,
      error: "Use your @gatech.edu email address.",
      status: 400,
    }
  }

  const user = await findRosterUserByGatechEmail(email)
  if (!user) {
    return {
      ok: false,
      error:
        "That email is not on the team roster. Ask a coach to add you, then try again.",
      status: 403,
    }
  }

  const latest = await prisma.emailLoginCode.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  })
  if (
    latest &&
    Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    return {
      ok: false,
      error: "Please wait a minute before requesting another code.",
      status: 429,
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await prisma.emailLoginCode.deleteMany({ where: { email } })
  await prisma.emailLoginCode.create({
    data: {
      email,
      codeHash: hashCode(email, code),
      expiresAt,
    },
  })

  const subject = "Your SwimBuzz sign-in code"
  const text = `Your SwimBuzz verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`
  const html = `
    <p style="font-family: system-ui, sans-serif; font-size: 16px; color: #111;">
      Your SwimBuzz verification code is
    </p>
    <p style="font-family: ui-monospace, monospace; font-size: 28px; letter-spacing: 0.2em; font-weight: 600; color: #111;">
      ${code}
    </p>
    <p style="font-family: system-ui, sans-serif; font-size: 14px; color: #555;">
      It expires in 10 minutes. If you did not request this, you can ignore this email.
    </p>
  `

  try {
    await sendEmail({ to: email, subject, text, html })
  } catch (err) {
    console.error("[email-login] send failed", err)
    await prisma.emailLoginCode.deleteMany({ where: { email } })
    return {
      ok: false,
      error: "Could not send the verification email. Try again shortly.",
      status: 502,
    }
  }

  return { ok: true }
}

export async function verifyEmailLoginCode(
  rawEmail: string,
  rawCode: string
) {
  const email = normalizeGatechEmail(rawEmail)
  const code = rawCode.trim().replace(/\s+/g, "")
  if (!email || !/^\d{6}$/.test(code)) return null

  const user = await findRosterUserByGatechEmail(email)
  if (!user) return null

  const record = await prisma.emailLoginCode.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  })
  if (!record) return null

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.emailLoginCode.deleteMany({ where: { email } })
    return null
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailLoginCode.deleteMany({ where: { email } })
    return null
  }

  const matches = record.codeHash === hashCode(email, code)
  if (!matches) {
    await prisma.emailLoginCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    return null
  }

  await prisma.emailLoginCode.deleteMany({ where: { email } })
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  })

  return user
}
