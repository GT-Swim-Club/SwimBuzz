/* eslint-disable @typescript-eslint/no-require-imports -- Shared Node CommonJS runtime. */
const { AsyncLocalStorage } = require("node:async_hooks")
const { Prisma } = require("@prisma/client")

// A shared context keeps the Next.js bundle and custom-server monitors consistent.
const contextKey = Symbol.for("swimbuzz.recoveryContext")
const context = globalThis[contextKey] ??= new AsyncLocalStorage()
const transactionKey = Symbol.for("swimbuzz.recoveryTransactionContext")
const transactionContext = globalThis[transactionKey] ??= new AsyncLocalStorage()
const installed = Symbol.for("swimbuzz.softDeletePolicy")
const activeMeet = { deletedAt: null }
const activePractice = { deletedAt: null }
const filters = {
  Meet: activeMeet,
  Practice: activePractice,
  Swim: { OR: [{ meetId: null }, { meetRef: { is: { OR: [activeMeet, { deleteSwimsOnPurge: false }] } } }] },
  PracticeSet: { practice: { is: activePractice } },
  PracticeAttendance: { practice: { is: activePractice } },
  PracticeComment: { practice: { is: activePractice } },
  MeetSignupForm: { meet: { is: activeMeet } },
  MeetSignupMonitorEvent: { meet: { is: activeMeet } },
  MeetSignupEntry: { form: { is: { meet: { is: activeMeet } } } },
  MeetRoomForm: { meet: { is: activeMeet } },
  MeetRoomPreference: { form: { is: { meet: { is: activeMeet } } } },
  MeetRoom: { form: { is: { meet: { is: activeMeet } } } },
  MeetRoomAssignment: { room: { is: { form: { is: { meet: { is: activeMeet } } } } } },
}
const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map(m => [m.name, m]))
const filteredActions = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy", "update", "updateMany", "delete", "deleteMany", "upsert",
])
function andWhere(where, filter) {
  // Keep unique keys at the top level for Prisma's extended WhereUniqueInput.
  return { ...where, AND: [...(where?.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []), filter] }
}
function filterSelections(model, args) {
  for (const selection of [args.select, args.include]) {
    if (!selection) continue
    for (const field of models[model]?.fields ?? []) {
      if (field.kind !== "object" || !selection[field.name]) continue
      let nested = selection[field.name]
      const filter = filters[field.type]
      if (filter && (field.isList || !field.isRequired)) {
        if (nested === true) nested = selection[field.name] = {}
        nested.where = andWhere(nested.where, filter)
      }
      if (nested !== true) filterSelections(field.type, nested)
    }
    if (selection._count) {
      if (selection._count === true) {
        selection._count = { select: Object.fromEntries((models[model]?.fields ?? []).filter(f => f.kind === "object" && f.isList).map(f => [f.name, true])) }
      }
      for (const [name, value] of Object.entries(selection._count.select ?? {})) {
        const field = models[model]?.fields.find(f => f.name === name)
        if (value && filters[field?.type]) {
          selection._count.select[name] = { where: andWhere(value === true ? undefined : value.where, filters[field.type]) }
        }
      }
    }
  }
}
async function guardParentWrites(prisma, model, data) {
  const rows = Array.isArray(data) ? data : [data]
  for (const field of models[model]?.fields ?? []) {
    if (field.kind !== "object" || field.isList || !filters[field.type]) continue
    const delegate = prisma[field.type[0].toLowerCase() + field.type.slice(1)]
    const checked = new Set()
    for (const row of rows) {
      if (!row) continue
      const foreignKey = field.relationFromFields?.[0]
      const targetKey = field.relationToFields?.[0]
      const key = row[field.name]?.connect ?? (foreignKey && row[foreignKey] != null ? { [targetKey]: row[foreignKey] } : null)
      if (!key || checked.has(JSON.stringify(key))) continue
      checked.add(JSON.stringify(key))
      if (!await delegate.findUnique({ where: key, select: { id: true } })) {
        throw new Error("This practice or meet is no longer available")
      }
    }
  }
}
function installSoftDeletePolicy(prisma) {
  if (prisma[installed]) return prisma
  prisma[installed] = true
  const transaction = prisma.$transaction.bind(prisma)
  prisma.$transaction = (input, ...options) => transaction(
    typeof input === "function" ? tx => transactionContext.run(tx, () => input(tx)) : input,
    ...options
  )
  prisma.$use(async (params, next) => {
    if (context.getStore()) return next(params)
    params.args ??= {}
    if (filteredActions.has(params.action) && filters[params.model]) {
      params.args.where = andWhere(params.args.where, filters[params.model])
    }
    if (["create", "createMany", "update", "updateMany", "upsert"].includes(params.action)) {
      await guardParentWrites(transactionContext.getStore() ?? prisma, params.model, params.args.data ?? params.args.create)
      if (params.action === "upsert") await guardParentWrites(transactionContext.getStore() ?? prisma, params.model, params.args.update)
    }
    filterSelections(params.model, params.args)
    return next(params)
  })
  return prisma
}
// Only recovery services and slug reservation may bypass active-record filtering.
// Await inside the context: PrismaPromise executes lazily, when awaited.
function withDeleted(callback) { return context.run(true, async () => await callback()) }
module.exports = { installSoftDeletePolicy, withDeleted }
