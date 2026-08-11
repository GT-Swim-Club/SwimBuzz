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
