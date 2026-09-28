import { installSoftDeletePolicy } from "../../soft-delete-policy"
import { Prisma, PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  __swimbuzzPrisma?: PrismaClient
  __swimbuzzPrismaSchemaId?: string
  prisma?: PrismaClient
}

function prismaSchemaId(): string {
  try {
    return Prisma.dmmf.datamodel.models
      .map((model) => `${model.name}:${model.fields.map((field) => field.name).join(",")}`)
      .join("|")
  } catch {
    return "unknown"
  }
}

function getPrisma(): PrismaClient {
  const schemaId = prismaSchemaId()
  if (
    globalForPrisma.__swimbuzzPrisma &&
    globalForPrisma.__swimbuzzPrismaSchemaId === schemaId
  ) {
    return installSoftDeletePolicy(globalForPrisma.__swimbuzzPrisma)
  }

  const prisma = installSoftDeletePolicy(new PrismaClient())
  globalForPrisma.__swimbuzzPrisma = prisma
  globalForPrisma.__swimbuzzPrismaSchemaId = schemaId
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
  return prisma
}

export const prisma = getPrisma()
