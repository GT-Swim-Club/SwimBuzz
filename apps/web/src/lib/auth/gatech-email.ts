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

export function isPlaceholderEmail(email: string): boolean {
  const lower = email.toLowerCase()
  return PLACEHOLDER_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}
