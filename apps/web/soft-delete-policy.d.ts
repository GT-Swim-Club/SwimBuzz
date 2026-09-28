import type { PrismaClient } from "@prisma/client"
export function installSoftDeletePolicy(prisma: PrismaClient): PrismaClient
export function withDeleted<T>(callback: () => T | Promise<T>): Promise<T>
