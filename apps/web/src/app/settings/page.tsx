import { redirect } from "next/navigation"
import Link from "next/link"
import type { ReactNode } from "react"
import AlertSoundSettings from "@/components/settings/AlertSoundSettings"
import AppearanceSettings from "@/components/settings/AppearanceSettings"
import NotificationPreferencesSettings from "@/components/settings/NotificationPreferencesSettings"
import ScraperSettings from "@/components/settings/ScraperSettings"
import SettingsRowLabel from "@/components/settings/SettingsRowLabel"
import ProfilePictureSettings from "@/components/athlete/ProfilePictureSettings"
import { STAFF_TITLE_LABELS, formatRoleLabel, isStaffRole, type IconName } from "@swimbuzz/shared"
import { parseNotificationPreferences } from "@/lib/notifications/notification-preferences"
import { prisma } from "@/lib/prisma"
import { athletePath } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"

export const metadata = { title: "Settings" }

/** Gold section heading above a bordered card, like the athlete page's Personal bests. */
function SettingsSection({
  title,
  description,
  aside,
  children,
}: {
  title: string
  description?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-1.5 flex min-h-[34px] items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-foreground-secondary">{description}</p>
          )}
        </div>
        {aside}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border-secondary bg-background shadow-xs">
        {children}
      </div>
    </section>
  )
}

function InfoRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <SettingsRowLabel icon={icon} title={label} muted />
      <p className="truncate text-sm font-medium text-foreground">{children}</p>
    </div>
  )
}

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/settings")

  const [athlete, user] = await Promise.all([
    prisma.athlete.findUnique({
      where: { userId: session.user.id },
      select: { id: true, slug: true }}),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true, notificationPreferences: true, alertSound: true }}),
  ])

  const notificationPreferences = parseNotificationPreferences(
    user?.notificationPreferences
  )
  const isStaff = isStaffRole(session.user.role)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <SettingsSection
        title="Account"
        aside={
          athlete ? (
            <Link
              href={athletePath(athlete.slug ?? athlete.id)}
              className="shrink-0 text-sm font-medium text-accent transition-colors hover:text-primary"
            >
              View profile
            </Link>
          ) : null
        }
      >
        <ProfilePictureSettings
          initialImage={user?.image ?? session.user.image}
          name={session.user.name}
          email={session.user.email}
        />
        <InfoRow icon="user" label="Name">{session.user.name || "—"}</InfoRow>
        <InfoRow icon="mail" label="Email">{session.user.email || "—"}</InfoRow>
        <InfoRow icon="idCard" label="Role">
          {session.user.staffTitle
            ? STAFF_TITLE_LABELS[session.user.staffTitle]
            : formatRoleLabel(session.user.role)}
        </InfoRow>
      </SettingsSection>

      <SettingsSection title="Notifications">
        <NotificationPreferencesSettings
          initialPreferences={notificationPreferences}
          viewer={{
            role: session.user.role,
            hasAthleteRecord: athlete != null,
          }}
        />
      </SettingsSection>

      {isStaff ? (
        <SettingsSection title="Sounds">
          <AlertSoundSettings initialEnabled={user?.alertSound ?? false} />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Appearance">
        <AppearanceSettings />
      </SettingsSection>

      {isStaff ? (
        <SettingsSection title="Desktop Scraper">
          <ScraperSettings />
        </SettingsSection>
      ) : null}
    </div>
  )
}
