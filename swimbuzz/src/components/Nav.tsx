import Link from "next/link"
import Image from "next/image"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import ProfileMenu from "@/components/ProfileMenu"
import NotificationsMenu from "@/components/NotificationsMenu"
import RunScraperButton from "@/components/RunScraperButton"
import AthleteViewToggle from "@/components/AthleteViewToggle"
import MobileNavMenu from "@/components/MobileNavMenu"
import { formatRoleLabel, isStaffRole } from "@/lib/auth-roles"
import {
  getAthleteViewAthlete,
  isAthleteViewEnabled,
} from "@/lib/athlete-view-server"
import { prisma } from "@/lib/prisma"

const navIconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4 shrink-0",
  "aria-hidden": true as const,
}

export default async function Nav() {
  const session = await getServerSession(authOptions)
  const user = session ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { defaultView: true } }) : null
  const defaultView = user?.defaultView ?? "gallery"

  const navLinks = [
    {
      href: "/athletes",
      label: "Roster",
      prefetch: false,
      icon: (
        <svg {...navIconProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      href: "/meets",
      label: "Meets",
      prefetch: false,
      icon: (
        <svg {...navIconProps}>
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </svg>
      ),
    },
    {
      href: "/practices",
      label: "Practices",
      prefetch: false,
      icon: (
        <svg {...navIconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
          <path d="M8 9h2" />
        </svg>
      ),
    },
    {
      href: "/qualifiers",
      label: "Nationals",
      prefetch: false,
      icon: (
        <svg {...navIconProps}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      ),
    },
  ] as const

  const isStaff = !!session && isStaffRole(session.user.role)
  const athleteView = isStaff ? await isAthleteViewEnabled() : false
  const showStaffTools = isStaff && !athleteView

  const previewAthlete = isStaff && athleteView ? await getAthleteViewAthlete() : null
  const previewAthletes = isStaff
    ? await prisma.athlete.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      })
    : []

  const linkedAthlete = session
    ? await prisma.athlete.findUnique({
        where: { userId: session.user.id },
        select: { id: true, swimCloudId: true },
      })
    : null

  const notifications = session
    ? await prisma.notification.findMany({
        where: {
          userId: session.user.id,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true,
        },
      })
    : []

  const roleLabel = previewAthlete
    ? `As ${previewAthlete.lastName}, ${previewAthlete.firstName}`
    : athleteView
      ? "Athlete View"
      : formatRoleLabel(session?.user.role ?? "ATHLETE")

  const athleteToggle = isStaff ? (
    <AthleteViewToggle
      athletes={previewAthletes.map((a) => ({
        id: a.id,
        name: `${a.lastName}, ${a.firstName}`,
      }))}
      selectedAthleteId={previewAthlete?.id ?? null}
    />
  ) : null

  const scraperButton = showStaffTools ? <RunScraperButton /> : null

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-zinc-200 bg-background px-4 py-3 dark:border-zinc-800 sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-7">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 font-semibold text-base tracking-tight hover:opacity-90 transition-opacity"
        >
          <Image
            src="/swimbuzz-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-md"
            priority
          />
          <span className="truncate">SwimBuzz</span>
        </Link>
        {session && (
          <div className="hidden items-center gap-5 text-[15px] text-foreground-secondary md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={link.prefetch}
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {athleteToggle ? <div className="hidden md:block">{athleteToggle}</div> : null}
        {scraperButton ? <div className="hidden md:block">{scraperButton}</div> : null}
        {session ? (
          <>
            <NotificationsMenu
              initialNotifications={notifications.map((n) => ({
                ...n,
                readAt: n.readAt?.toISOString() ?? null,
                createdAt: n.createdAt.toISOString(),
              }))}
            />
            <ProfileMenu
              name={session.user.name}
              email={session.user.email}
              image={session.user.image}
              roleLabel={roleLabel}
              rosterProfileHref={linkedAthlete ? `/athletes/${linkedAthlete.id}` : null}
              swimCloudProfileHref={
                linkedAthlete?.swimCloudId
                  ? `https://www.swimcloud.com/swimmer/${linkedAthlete.swimCloudId}/`
                  : null
              }
            />
            <MobileNavMenu
              links={[...navLinks]}
              staffTools={
                athleteToggle || scraperButton ? (
                  <>
                    {athleteToggle}
                    {scraperButton}
                  </>
                ) : undefined
              }
            />
          </>
        ) : (
          <Link
            href="/signin"
            className="inline-flex items-center rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-text hover:bg-primary-hover transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}
