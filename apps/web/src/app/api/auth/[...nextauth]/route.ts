import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { Role } from "@prisma/client"
import { verifyEmailLoginCode } from "@/lib/email-login"
import { readAndClearStaffLinkCookie } from "@/lib/staff-link"
import {
  currentStaffTerm,
  staffAccountForEmail,
  STAFF_MUST_USE_STAFF_TAB_ERROR,
} from "@swimbuzz/shared"

/** Re-read role/staffTitle from the DB when the JWT's stamped staff term has lapsed. */
async function refreshStaffTermIfLapsed(token: {
  sub?: string
  role?: Role
  staffTitle?: import("@prisma/client").StaffTitle | null
  staffTerm?: string | null
}) {
  const term = currentStaffTerm()
  if (token.staffTerm === term) return
  if (!token.sub) return
  const dbUser = await prisma.user.findUnique({
    where: { id: token.sub },
    select: { role: true, staffTitle: true },
  })
  if (dbUser) {
    token.role = dbUser.role
    token.staffTitle = dbUser.staffTitle
  }
  token.staffTerm = term
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      id: "email-otp",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.code) return null
        const user = await verifyEmailLoginCode(
          credentials.email,
          credentials.code
        )
        if (!user) return null
        // Coach/exec accounts must sign in through the staff two-step flow
        // (GT-email code, then Google) so a session is only ever issued
        // after the Google step — this direct-session path is athlete-only.
        if (user.staffTitle) {
          throw new Error(STAFF_MUST_USE_STAFF_TAB_ERROR)
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          staffTitle: user.staffTitle,
        }
      },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    redirect({ url, baseUrl }) {
      // Honor explicit same-origin callback URLs (sign-in → /athletes, sign-out
      // → /). Anything off-origin falls back to the site root.
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true

      const staff = staffAccountForEmail(profile?.email ?? "")
      if (!staff) return "/signin?error=StaffOnly"

      const link = await readAndClearStaffLinkCookie()
      if (!link) return "/signin?error=StaffLinkRequired"

      // Pre-link the Google credential to the ROSTER user (never create a
      // new one) — the PrismaAdapter's own getUserByAccount lookup, which
      // runs right after this callback returns, then resolves the session
      // to that same roster user.
      await prisma.$transaction([
        prisma.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId: account.providerAccountId,
            },
          },
          create: {
            userId: link.sub,
            type: "oauth",
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
          update: { userId: link.sub },
        }),
        prisma.user.update({
          where: { id: link.sub },
          data: {
            role: staff.role,
            staffTitle: staff.title,
            staffTerm: currentStaffTerm(),
          },
        }),
      ])
      return true
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role
        token.staffTitle = user.staffTitle
        token.staffTerm = currentStaffTerm()
      }
      // After profile picture upload/remove, refresh image (and role/title) from DB.
      if (trigger === "update" && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { image: true, role: true, staffTitle: true },
        })
        if (dbUser) {
          token.picture = dbUser.image
          token.role = dbUser.role
          token.staffTitle = dbUser.staffTitle
        }
      }
      // Staff titles expire at the term boundary (1 May) — re-sync a
      // possibly-stale JWT against the DB once the stamped term lapses.
      await refreshStaffTermIfLapsed(token)
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub!
      session.user.role = token.role as Role
      session.user.staffTitle = token.staffTitle
      session.user.staffTerm = token.staffTerm
      if (token.picture !== undefined) {
        session.user.image = token.picture as string | null
      }
      return session
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
