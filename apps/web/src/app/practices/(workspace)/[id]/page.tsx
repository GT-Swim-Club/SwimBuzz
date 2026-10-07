import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import PracticeDetailLoader from "../PracticeDetailLoader"

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  // Deliberately no Suspense boundary here: on a cold load the detail suspends
  // into PracticesWorkspaceLayout's boundary, so sidebar and detail reveal
  // together. Client navigation between practices skeletons the pane via
  // PracticesSidebar's pending-link tracking instead.
  return <PracticeDetailLoader param={param} />
}
