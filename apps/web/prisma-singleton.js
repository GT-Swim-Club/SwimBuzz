const { Prisma, PrismaClient } = require("@prisma/client")

/** Shared across Next.js and CJS monitors in the same Node process. */
const globalForPrisma = globalThis

function prismaSchemaId() {
  try {
    return Prisma.dmmf.datamodel.models
      .map((model) => `${model.name}:${model.fields.map((field) => field.name).join(",")}`)
      .join("|")
  } catch {
    return "unknown"
  }
}

const schemaId = prismaSchemaId()
const prisma =
  globalForPrisma.__swimbuzzPrisma && globalForPrisma.__swimbuzzPrismaSchemaId === schemaId
    ? globalForPrisma.__swimbuzzPrisma
    : new PrismaClient()

globalForPrisma.__swimbuzzPrisma = prisma
globalForPrisma.__swimbuzzPrismaSchemaId = schemaId

module.exports = { prisma }
