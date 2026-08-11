import { createHash, randomBytes } from "crypto"
import { SignJWT, jwtVerify } from "jose"
import type { Session } from "next-auth"
import type { Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const ACCESS_TTL_SEC = 60 * 60 // 1 hour
const REFRESH_TTL_MS = 60 * 60 * 24 * 60 * 1000 // 60 days

export type MobileAccessClaims = {
  sub: string
  email?: string | null
  name?: string | null
  picture?: string | null
  role: Role
  typ: "mobile_access"
}

function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set")
  return new TextEncoder().encode(secret)
}

function hashRefreshToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex")
}

export async function signMobileAccessToken(user: {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  role: Role
}): Promise<{ accessToken: string; expiresIn: number }> {
  const expiresIn = ACCESS_TTL_SEC
  const accessToken = await new SignJWT({
    email: user.email,
    name: user.name,
    picture: user.image,
    role: user.role,
    typ: "mobile_access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secretKey())

  return { accessToken, expiresIn }
}

export async function verifyMobileAccessToken(
  token: string
): Promise<MobileAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (payload.typ !== "mobile_access" || typeof payload.sub !== "string") {
      return null
    }
    return {
      sub: payload.sub,
      email: (payload.email as string | null | undefined) ?? null,
      name: (payload.name as string | null | undefined) ?? null,
      picture: (payload.picture as string | null | undefined) ?? null,
      role: payload.role as Role,
      typ: "mobile_access",
    }
  } catch {
    return null
  }
}

export async function issueMobileTokens(user: {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  role: Role
}) {
  const { accessToken, expiresIn } = await signMobileAccessToken(user)
  const refreshToken = randomBytes(48).toString("base64url")
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS)

  await prisma.mobileRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    },
  })

  return {
    accessToken,
    refreshToken,
    expiresIn,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
    },
  }
}

export async function rotateMobileRefreshToken(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken)
  const existing = await prisma.mobileRefreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
        },
      },
    },
  })

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    return null
  }

  await prisma.mobileRefreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  })

  return issueMobileTokens(existing.user)
}

export async function revokeMobileRefreshToken(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken)
  await prisma.mobileRefreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export function sessionFromMobileClaims(
  claims: MobileAccessClaims
): Session {
  return {
    user: {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      image: claims.picture ?? null,
      role: claims.role,
    },
    expires: new Date(Date.now() + ACCESS_TTL_SEC * 1000).toISOString(),
  }
}

/** Verify a Google ID token from the mobile SDK via tokeninfo endpoint. */
export async function verifyGoogleIdToken(idToken: string): Promise<{
  email: string
  name?: string
  picture?: string
  sub: string
} | null> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    email?: string
    email_verified?: string
    name?: string
    picture?: string
    sub?: string
    aud?: string
  }
  const allowedAud = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  ].filter(Boolean)
  if (
    !data.email ||
    data.email_verified !== "true" ||
    !data.sub ||
    (allowedAud.length > 0 && data.aud && !allowedAud.includes(data.aud))
  ) {
    return null
  }
  return {
    email: data.email.toLowerCase(),
    name: data.name,
    picture: data.picture,
    sub: data.sub,
  }
}
