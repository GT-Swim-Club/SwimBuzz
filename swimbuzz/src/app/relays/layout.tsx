import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"

export default async function RelaysLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/api/auth/signin")
  if (!["COACH", "MEET_DIRECTOR"].includes(session.user.role)) redirect("/dashboard")
  return <>{children}</>
}