import Link from "next/link"
import Image from "next/image"
import ProfileMenu from "@/components/ProfileMenu"
import NotificationsMenu from "@/components/NotificationsMenu"
import AdaptiveHeaderLayout from "@/components/AdaptiveHeaderLayout"
import { formatRoleLabel, isStaffRole } from "@/lib/auth-roles"
import { athletePreferredNameLastFirst } from "@swimbuzz/shared"
import {
  getAthleteViewAthlete,
  isAthleteViewEnabled } from "@/lib/athlete-view-server"
import { prisma } from "@/lib/prisma"
import { athletePath } from "@/lib/slug"
import { getSession } from "@/lib/session"
import { AppIcon } from "@/components/AppIcon"
import SignInHeaderButton from "@/components/SignInHeaderButton"

const navIconClass = "h-4 w-4 shrink-0"

export default async function Nav() {
  const session = await getSession()
  const user = session ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { defaultView: true } }) : null
  const defaultView = user?.defaultView ?? "gallery"

  const navLinks = [
    {
      href: "/athletes",
      label: "Roster",
      prefetch: false,
      icon: <AppIcon key="roster" name="roster" className={navIconClass} />},
    {
      href: "/meets",
      label: "Meets",
      prefetch: false,
      icon: <AppIcon key="meets" name="calendar" className={navIconClass} />},
    {
      href: "/practices",
      label: "Practices",
      prefetch: false,
      icon: <AppIcon key="practices" name="fileText" className={navIconClass} />},
    {
      href: "/qualifiers",
      label: "Nationals",
      prefetch: false,
      icon: <AppIcon key="nationals" name="trophy" className={navIconClass} />},
  ] as const

  const isStaff = !!session && isStaffRole(session.user.role)
  const athleteView = isStaff ? await isAthleteViewEnabled() : false
  const showStaffTools = isStaff && !athleteView

  const previewAthlete = isStaff && athleteView ? await getAthleteViewAthlete() : null
  const previewAthletes = isStaff
    ? await prisma.athlete.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, nicknames: true }})
    : []

  const linkedAthlete = session
    ? await prisma.athlete.findUnique({
        where: { userId: session.user.id },
        select: { id: true, slug: true, swimCloudId: true }})
    : null

  const notifications = session
    ? await prisma.notification.findMany({
        where: {
          userId: session.user.id},
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true}})
    : []

  const roleLabel = previewAthlete
    ? `As ${athletePreferredNameLastFirst(previewAthlete)}`
    : athleteView
      ? "Athlete View"
      : formatRoleLabel(session?.user.role ?? "ATHLETE")

  const headerBrand = (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 font-semibold text-base tracking-tight text-primary-active transition-opacity hover:opacity-90 dark:text-primary-hover"
    >
      <Image src="/swimbuzz-logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md" priority />
      <span className="truncate">SwimBuzz</span>
    </Link>
  )

  const compactHeaderBrand = (
    <Link
      href="/"
      aria-label="SwimBuzz home"
      className="inline-flex items-center rounded-md transition-opacity hover:opacity-90"
    >
      <Image src="/swimbuzz-logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md" priority />
      <span className="sr-only">SwimBuzz</span>
    </Link>
  )

  const headerUtilities = session ? (
    <>
      <NotificationsMenu
        initialNotifications={notifications.map((notification) => ({
          ...notification,
          readAt: notification.readAt?.toISOString() ?? null,
          createdAt: notification.createdAt.toISOString(),
        }))}
      />
      <ProfileMenu
        name={session.user.name}
        email={session.user.email}
        image={session.user.image}
        roleLabel={roleLabel}
        rosterProfileHref={linkedAthlete ? athletePath(linkedAthlete.slug ?? linkedAthlete.id) : null}
        swimCloudProfileHref={linkedAthlete?.swimCloudId ? `https://www.swimcloud.com/swimmer/${linkedAthlete.swimCloudId}/` : null}
      />
    </>
  ) : (
    <SignInHeaderButton />
  )

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-zinc-200 bg-background px-6 py-4 dark:border-zinc-800">
      {session ? (
        <AdaptiveHeaderLayout
          brand={headerBrand}
          compactBrand={compactHeaderBrand}
          utilities={headerUtilities}
          links={navLinks}
          athletes={previewAthletes.map((athlete) => ({ id: athlete.id, name: athletePreferredNameLastFirst(athlete) }))}
          selectedAthleteId={previewAthlete?.id ?? null}
          showAthleteView={isStaff}
          showScraper={showStaffTools}
        />
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-center">{headerBrand}</div>
          <div className="flex shrink-0 items-center">{headerUtilities}</div>
        </>
      )}
    </nav>
  )
}
