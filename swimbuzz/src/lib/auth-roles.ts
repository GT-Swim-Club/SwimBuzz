import { Role } from "@prisma/client"

export function isStaffRole(role: Role | string): boolean {
  return role === Role.COACH || role === Role.EXEC
}

const ROLE_LABELS: Record<Role, string> = {
  COACH: "Coach",
  EXEC: "Exec",
  ATHLETE: "Athlete",
}

export function formatRoleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] ?? String(role)
}
