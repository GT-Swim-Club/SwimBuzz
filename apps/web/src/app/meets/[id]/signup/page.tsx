import BackLink from "@/components/BackLink"
import MeetResourceIcon from "@/components/MeetResourceIcon"
import { isEventOrder } from "@/lib/meet-event-order"
import { Gender } from "@prisma/client"
import { notFound, redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { formatDateTime } from "@/lib/utils"
import { prisma } from "@/lib/prisma"
import { isStaffRole } from "@/lib/auth-roles"
import { resolveViewerAthleteId } from "@/lib/athlete-view-server"
import {
  isSignupAnswers,
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTimes,
  resolveSignupEventOptions,
  signupWindowStatus,
  signupWithdrawStatus,
} from "@/lib/meet-signup"
import MeetSignupAthleteForm from "../MeetSignupAthleteForm"
import EventOrderButton from "../EventOrderButton"

export default async function MeetSignupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/signin?callbackUrl=/meets/${encodeURIComponent(param)}/signup`)
  }

  const viewerAthleteId = await resolveViewerAthleteId(
    session.user.id,
    session.user.role
  )
  if (!viewerAthleteId) redirect(`/meets/${encodeURIComponent(param)}`)

  const [meet, athlete] = await Promise.all([
    prisma.meet.findFirst({
      where: { OR: [{ id: param }, { slug: param }] },
      select: {
        id: true,
        slug: true,
        name: true,
        location: true,
        packetUrl: true,
        course: true,
        eventOrder: true,
        signupForm: {
          include: {
            entries: {
              where: { athleteId: viewerAthleteId },
              select: { events: true, entryTimes: true, notes: true, answers: true },
            },
          },
        },
      },
    }),
    prisma.athlete.findUnique({
      where: { id: viewerAthleteId },
      select: { id: true, firstName: true, lastName: true, gender: true },
    }),
  ])

  if (!meet) notFound()
  const meetPath = `/meets/${meet.slug ?? meet.id}`
  if (meet.slug && param !== meet.slug) redirect(`${meetPath}/signup`)
  if (!meet.signupForm || !athlete) redirect(meetPath)

  const form = meet.signupForm
  const entry = form.entries[0] ?? null
  const window = signupWindowStatus({ openAt: form.openAt, closeAt: form.closeAt })
  const withdraw = signupWithdrawStatus({
    openAt: form.openAt,
    closeAt: form.closeAt,
    withdrawUntil: form.withdrawUntil,
  })
  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const eventOrder = isEventOrder(meet.eventOrder) ? meet.eventOrder : null
  const isStaff = isStaffRole(session.user.role)
  const athleteName = `${athlete.lastName}, ${athlete.firstName}`

  return (
    <main className="mx-auto w-full max-w-6xl flex flex-col gap-6 py-2 sm:py-4">
      <BackLink
        fallbackHref={meetPath}
        fallbackLabel={meet.name}
        className="self-start -mb-5 inline-flex items-center gap-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
      />
      <header>
        <h1 className="text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
          {meet.name}
        </h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Meet sign-up
        </p>
        {meet.location && (
          <p className="mt-2 text-sm text-foreground-secondary">
            {meet.location}
          </p>
        )}
        {(form.closeAt || form.withdrawUntil) && (
          <div className="mt-3 flex flex-col gap-y-1 text-sm text-foreground-secondary">
            {form.closeAt && (
              <span>Sign-up closes: {formatDateTime(form.closeAt)}</span>
            )}
            {form.withdrawUntil && (
              <span>Drop deadline: {formatDateTime(form.withdrawUntil)}</span>
            )}
          </div>
        )}
      </header>
      {(meet.packetUrl || eventOrder) && (
        <section aria-label="Meet resources" className="flex flex-wrap gap-2">
          {meet.packetUrl && (
            <a
              href={meet.packetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-fill"
            >
              <MeetResourceIcon kind="packet" />
              Meet Packet
            </a>
          )}
          {eventOrder && <EventOrderButton order={eventOrder} />}
        </section>
      )}
      {eventOptions.length === 0 ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          The meet order has not been added yet, so event sign-up is not available. Please check back or ask a coach.
        </section>
      ) : (
        <MeetSignupAthleteForm
          meetId={meet.id}
          course={meet.course}
          eventOptions={eventOptions}
          minEvents={form.minEvents}
          maxEvents={form.maxEvents}
          maxRelayEvents={form.maxRelayEvents}
          askNotes={form.askNotes}
          instructions={form.instructions}
          customQuestions={normalizeMeetSignupQuestions(form.customQuestions)}
          windowOpen={window.open}
          windowReason={window.reason}
          canWithdraw={withdraw.allowed}
          withdrawReason={withdraw.reason}
          withdrawDeadline={withdraw.deadline?.toISOString() ?? null}
          formOpenAt={form.openAt?.toISOString() ?? null}
          formCloseAt={form.closeAt?.toISOString() ?? null}
          formWithdrawUntil={form.withdrawUntil?.toISOString() ?? null}
          isCoach={false}
          isStaff={isStaff}
          selfAthleteId={athlete.id}
          athletes={[
            {
              id: athlete.id,
              name: athleteName,
              gender: athlete.gender === Gender.F ? "F" : "M",
            },
          ]}
          entriesByAthleteId={
            entry
              ? {
                  [athlete.id]: {
                    events: entry.events,
                    entryTimes: normalizeSignupEntryTimes(entry.entryTimes),
                    notes: entry.notes,
                    answers: isSignupAnswers(entry.answers) ? entry.answers : {},
                  },
                }
              : {}
          }
          pageMode
        />
      )}
    </main>
  )
}
