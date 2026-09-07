import { redirect } from "next/navigation"
import Link from "next/link"
import AppearanceSettings from "@/components/settings/AppearanceSettings"
import ViewPreferencesSettings from "@/components/settings/ViewPreferencesSettings"
import CancelPendingProfileChangesButton from "@/components/athlete/CancelPendingProfileChangesButton"
import EditNicknamesForm from "@/components/athlete/EditNicknamesForm"
import NotificationPreferencesSettings from "@/components/settings/NotificationPreferencesSettings"
import ProfilePictureSettings from "@/components/athlete/ProfilePictureSettings"
import SetSwimCloudIdForm from "@/components/athlete/SetSwimCloudIdForm"
import { formatRoleLabel, isStaffRole } from "@/lib/auth/auth-roles"
import { STAFF_TITLE_LABELS } from "@swimbuzz/shared"
import { parseNotificationPreferences } from "@/lib/notifications/notification-preferences"
import { parsePendingProfileChanges } from "@/lib/athlete/pending-profile-changes"
import { prisma } from "@/lib/prisma"
import { athletePath } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { AppIcon } from "@/components/ui/AppIcon"

export const metadata = {
  title: "Settings — SwimBuzz"}

const sectionIconClass = "h-4 w-4 shrink-0 text-foreground-tertiary"

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/settings")

  const [athlete, user] = await Promise.all([
    prisma.athlete.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        slug: true,
        nicknames: true,
        swimCloudId: true,
        pendingProfileChanges: true}}),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true, notificationPreferences: true, defaultView: true, defaultPracticesView: true }}),
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
              <AppIcon name="user" className={sectionIconClass} />
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
                {session.user.staffTitle
                  ? STAFF_TITLE_LABELS[session.user.staffTitle]
                  : formatRoleLabel(session.user.role)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border-secondary">
          <div className="flex items-center justify-between gap-4 border-b border-border-secondary px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AppIcon name="idCard" className={sectionIconClass} />
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
              <AppIcon name="bell" className={sectionIconClass} />
              Notifications
            </h2>
            <p className="mt-0.5 text-xs text-foreground-secondary">
              Choose which in-app alerts you receive
            </p>
          </div>
          <NotificationPreferencesSettings
            initialPreferences={notificationPreferences}
            isAthlete={!isStaffRole(session.user.role)}
            isMeetDirector={session.user.staffTitle === "MEET_DIRECTOR"}
          />
        </section>

        <section className="rounded-xl border border-border-secondary">
          <div className="border-b border-border-secondary px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AppIcon name="palette" className={sectionIconClass} />
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
