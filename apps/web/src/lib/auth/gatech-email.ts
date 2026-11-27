const PLACEHOLDER_SUFFIXES = [
  "@roster.placeholder",
  "@swimcloud.placeholder",
]

/** Normalize and validate a Georgia Tech student/staff email. */
export function normalizeGatechEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!email.endsWith("@gatech.edu")) return null
  if (email.length < "@gatech.edu".length + 1) return null
  if (!/^[a-z0-9._%+-]+@gatech\.edu$/.test(email)) return null
  return email
}

/**
 * A stand-in email for an athlete added without one (a past season's swimmer): User.email is
 * required and unique, but a placeholder can't sign in, is hidden in the app and CSV, and a
 * roster import with their real email replaces it.
 */
export function newPlaceholderEmail(): string {
  return `${crypto.randomUUID()}@roster.placeholder`
}

export function isPlaceholderEmail(email: string): boolean {
  const lower = email.toLowerCase()
  return PLACEHOLDER_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}
