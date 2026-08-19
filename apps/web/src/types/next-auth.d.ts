import { Role, StaffTitle } from "@prisma/client"
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      staffTitle?: StaffTitle | null
      /** Staff term (e.g. "2026-2027") the current role/staffTitle were stamped for — see currentStaffTerm(). */
      staffTerm?: string | null
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }

  interface User {
    role: Role
    staffTitle?: StaffTitle | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role
    staffTitle?: StaffTitle | null
    staffTerm?: string | null
  }
}
