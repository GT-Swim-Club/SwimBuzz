import { prisma } from "@/lib/prisma"

export async function hasLoggedInBefore(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      emailVerified: true,
      accounts: { select: { id: true } },
    },
  })

  if (!user) return false
  return !!user.emailVerified || user.accounts.length > 0
}
