import BackLink from "@/components/BackLink"
import { Gender } from "@prisma/client"
import { notFound, redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { isStaffUi } from "@/lib/athlete-view-server"
import {
  isSignupAnswers,
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTimes,
  resolveSignupEventOptions,
} from "@/lib/meet-signup"
import MeetSignupManager from "./MeetSignupManager"

export default async function MeetSignupManagerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) redirect(`/signin?callbackUrl=/meets/${encodeURIComponent(param)}/signups`)
  if (!(await isStaffUi(session.user.role))) redirect(`/meets/${encodeURIComponent(param)}`)

  const meet = await prisma.meet.findFirst({
    where: { OR: [{ id: param }, { slug: param }] },
    select: {
      id: true,
      slug: true,
      name: true,
      course: true,
      eventOrder: true,
      signupForm: {
        include: {
          entries: {
            include: {
              athlete: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  gender: true,
                  user: { select: { staffTitle: true } },
                },
              },
            },
            orderBy: [{ athlete: { lastName: "asc" } }, { athlete: { firstName: "asc" } }],
          },
        },
      },
    },
  })

  if (!meet) notFound()
  const meetPath = `/meets/${meet.slug ?? meet.id}`
  if (meet.slug && param !== meet.slug) redirect(`${meetPath}/signups`)
  const form = meet.signupForm
  return (
    <main className="mx-auto w-full max-w-6xl flex flex-col gap-6 py-2 sm:py-4">
      <BackLink
        fallbackHref={meetPath}
        fallbackLabel={meet.name}
        className="self-start -mb-5 inline-flex items-center gap-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
      />
      <MeetSignupManager
        meetId={meet.id}
        meetName={meet.name}
        course={meet.course}
        eventOptions={resolveSignupEventOptions(meet.eventOrder)}
        askNotes={form?.askNotes ?? true}
        questions={normalizeMeetSignupQuestions(form?.customQuestions)}
        configInitial={
          form
            ? {
                instructions: form.instructions,
                minEvents: form.minEvents,
                maxEvents: form.maxEvents,
                maxRelayEvents: form.maxRelayEvents,
                askNotes: form.askNotes,
                customQuestions: normalizeMeetSignupQuestions(form.customQuestions),
                openAt: form.openAt?.toISOString() ?? null,
                closeAt: form.closeAt?.toISOString() ?? null,
                withdrawUntil: form.withdrawUntil?.toISOString() ?? null,
              }
            : null
        }
        entries={(form?.entries ?? []).map((entry) => ({
          id: entry.id,
          athleteId: entry.athleteId,
          name: `${entry.athlete.lastName}, ${entry.athlete.firstName}`,
          gender: entry.athlete.gender === Gender.F ? "F" : "M",
          staffTitle: entry.athlete.user?.staffTitle ?? null,
          events: entry.events,
          entryTimes: normalizeSignupEntryTimes(entry.entryTimes),
          notes: entry.notes,
          answers: isSignupAnswers(entry.answers) ? entry.answers : {},
        }))}
      />
    </main>
  )
}
