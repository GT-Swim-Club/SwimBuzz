import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import AppearanceSettings from "@/components/AppearanceSettings"
import ViewPreferencesSettings from "@/components/ViewPreferencesSettings"
import CancelPendingProfileChangesButton from "@/components/CancelPendingProfileChangesButton"
import EditNicknamesForm from "@/components/EditNicknamesForm"
import NotificationPreferencesSettings from "@/components/NotificationPreferencesSettings"
import ProfilePictureSettings from "@/components/ProfilePictureSettings"
import SetSwimCloudIdForm from "@/components/SetSwimCloudIdForm"
import { formatRoleLabel, isStaffRole } from "@/lib/auth-roles"
import { parseNotificationPreferences } from "@/lib/notification-preferences"
import { parsePendingProfileChanges } from "@/lib/pending-profile-changes"
import { prisma } from "@/lib/prisma"
import { athletePath } from "@/lib/slug"

export const metadata = {
  title: "Settings — SwimBuzz",
}

const sectionIconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4 shrink-0 text-foreground-tertiary",
  "aria-hidden": true as const,
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/signin?callbackUrl=/settings")

  const [athlete, user] = await Promise.all([
    prisma.athlete.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        slug: true,
        nicknames: true,
        swimCloudId: true,
        pendingProfileChanges: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true, notificationPreferences: true, defaultView: true, defaultPracticesView: true },
    }),
  ])

  const requiresApproval = !isStaffRole(session.user.role)
  const pending = athlete
    ? parsePendingProfileChanges(athlete.pendingProfileChanges)
    : null
  const notificationPreferences = parseNotificationPreferences(
    user?.notificationPreferences
  )

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Settings
      </h1>
      <p className="mt-1 text-sm text-foreground-secondary">
        Manage your account, notifications, and appearance.
      </p>

      <div className="mt-8 space-y-6">
        <section className="rounded-xl border border-border-secondary">
          <div className="border-b border-border-secondary px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <svg {...sectionIconProps}>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Account
            </h2>
          </div>
          <div className="divide-y divide-border">
            <ProfilePictureSettings
              initialImage={user?.image ?? session.user.image}
              name={session.user.name}
              email={session.user.email}
              canEdit={!isStaffRole(session.user.role)}
            />
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-sm text-foreground-secondary">Name</p>
              <p className="truncate text-sm font-medium text-foreground">
                {session.user.name || "—"}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-sm text-foreground-secondary">Email</p>
              <p className="truncate text-sm font-medium text-foreground">
                {session.user.email || "—"}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-sm text-foreground-secondary">Role</p>
              <p className="text-sm font-medium text-foreground">
                {formatRoleLabel(session.user.role)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border-secondary">
          <div className="flex items-center justify-between gap-4 border-b border-border-secondary px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <svg {...sectionIconProps}>
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M15 7h2" />
                <path d="M15 11h2" />
                <path d="M7 15h10" />
              </svg>
              Profile
            </h2>
            {athlete ? (
              <Link
                href={athletePath(athlete.slug ?? athlete.id)}
                className="shrink-0 text-sm text-primary hover:text-primary-hover"
              >
                View profile
              </Link>
            ) : null}
          </div>
          {athlete ? (
            <div className="divide-y divide-border">
              {requiresApproval && (
                <div className="px-4 py-3">
                  <p className="text-xs text-foreground-secondary">
                    SwimCloud ID and nickname changes need coach approval before
                    they take effect.
                  </p>
                  {pending && (
                    <div className="mt-2">
                      <CancelPendingProfileChangesButton athleteId={athlete.id} />
                    </div>
                  )}
                </div>
              )}
              <div className="px-4 py-3 space-y-2">
                <div>
                  <p className="text-sm text-foreground">SwimCloud ID</p>
                  <p className="text-xs text-foreground-secondary">
                    Find it in your SwimCloud profile URL (e.g. swimcloud.com/swimmer/
                    <span className="font-mono">1234567</span>).
                  </p>
                </div>
                <SetSwimCloudIdForm
                  athleteId={athlete.id}
                  initialSwimCloudId={athlete.swimCloudId}
                  requiresApproval={requiresApproval}
                  pendingSwimCloudId={pending?.swimCloudId ?? null}
                />
              </div>
              <div className="px-4 py-3 space-y-2">
                <div>
                  <p className="text-sm text-foreground">Nicknames</p>
                  <p className="text-xs text-foreground-secondary">
                    Alternate names used to match imported results to you.
                  </p>
                </div>
                <EditNicknamesForm
                  athleteId={athlete.id}
                  initialNicknames={athlete.nicknames}
                  requiresApproval={requiresApproval}
                  pendingNicknames={
                    pending?.nicknames !== undefined ? pending.nicknames : null
                  }
                />
              </div>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-foreground-secondary">
              Your account isn&apos;t linked to a roster athlete.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border-secondary">
          <div className="border-b border-border-secondary px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <svg {...sectionIconProps}>
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              Notifications
            </h2>
            <p className="mt-0.5 text-xs text-foreground-secondary">
              Choose which in-app alerts you receive
            </p>
          </div>
          <NotificationPreferencesSettings
            initialPreferences={notificationPreferences}
            isAthlete={!isStaffRole(session.user.role)}
          />
        </section>

        <section className="rounded-xl border border-border-secondary">
          <div className="border-b border-border-secondary px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <svg {...sectionIconProps}>
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
              </svg>
              Appearance
            </h2>
          </div>
          <AppearanceSettings />
          <ViewPreferencesSettings defaultView={user?.defaultView ?? "gallery"} defaultPracticesView={user?.defaultPracticesView ?? "week"} />
        </section>


      </div>
    </div>
  )
}
