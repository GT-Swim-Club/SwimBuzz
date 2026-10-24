export type AppRole = "COACH" | "EXEC" | "ATHLETE"

export function isStaffRole(role: AppRole | string): boolean {
  return role === "COACH" || role === "EXEC"
}

const ROLE_LABELS: Record<AppRole, string> = {
  COACH: "Coach",
  EXEC: "Exec",
  ATHLETE: "Athlete",
}

export function formatRoleLabel(role: AppRole | string): string {
  return ROLE_LABELS[role as AppRole] ?? String(role)
}

/**
 * Coach/exec sign-in identity: which @gtswimclub.com address maps to which
 * staff title, and which permission role (Role enum) that title carries.
 *
 * Social Director is deliberately `role: "ATHLETE"` — same permissions as an
 * athlete, no Athlete View toggle (already staff-gated) — while every other
 * title gets coach-level access via `role: "COACH" | "EXEC"`.
 */
export const STAFF_ACCOUNTS = {
  coach: { title: "COACH", role: "COACH" },
  president: { title: "PRESIDENT", role: "EXEC" },
  vp: { title: "VICE_PRESIDENT", role: "EXEC" },
  secretary: { title: "SECRETARY", role: "EXEC" },
  treasurer: { title: "TREASURER", role: "EXEC" },
  meetdirector: { title: "MEET_DIRECTOR", role: "EXEC" },
  socialdirector: { title: "SOCIAL_DIRECTOR", role: "ATHLETE" },
} as const satisfies Record<string, { title: string; role: AppRole }>

export type StaffTitle = (typeof STAFF_ACCOUNTS)[keyof typeof STAFF_ACCOUNTS]["title"]

/** The Google Workspace domain coach/exec accounts sign in with. */
export const STAFF_DOMAIN = "gtswimclub.com"

export const STAFF_TITLE_LABELS: Record<StaffTitle, string> = {
  COACH: "Coach",
  PRESIDENT: "President",
  VICE_PRESIDENT: "Vice President",
  SECRETARY: "Secretary",
  TREASURER: "Treasurer",
  MEET_DIRECTOR: "Meet Director",
  SOCIAL_DIRECTOR: "Social Director",
}

/** Exact copy shown when a non-staff Google account tries the Coaches & Exec sign-in tab. */
export const STAFF_ONLY_SIGNIN_ERROR =
  "This sign-in is only for coaches and exec. Please sign in as an Athlete."

/** Shown on the Coaches & Exec tab if Google is completed before the GT-email code step. */
export const STAFF_LINK_REQUIRED_ERROR =
  "Verify your Georgia Tech email first, then continue with Google."

/**
 * Resolve a `@gtswimclub.com` address (e.g. "president@gtswimclub.com") to its
 * staff title + permission role, or null if the address isn't a recognized
 * staff mailbox (including any address outside STAFF_DOMAIN).
 */
export function staffAccountForEmail(
  rawEmail: string
): { title: StaffTitle; role: AppRole } | null {
  const email = rawEmail.trim().toLowerCase()
  const suffix = `@${STAFF_DOMAIN}`
  if (!email.endsWith(suffix)) return null
  const localPart = email.slice(0, -suffix.length)
  const account = (STAFF_ACCOUNTS as Record<string, { title: StaffTitle; role: AppRole }>)[
    localPart
  ]
  return account ?? null
}

/** Which badge icon a title renders as — every title but COACH is exec. */
export function staffBadgeIcon(title: StaffTitle): "coachBadge" | "execBadge" {
  return title === "COACH" ? "coachBadge" : "execBadge"
}