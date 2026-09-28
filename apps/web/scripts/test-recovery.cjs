/* eslint-disable @typescript-eslint/no-require-imports -- Shared Node CommonJS runtime. */
/* Runs recovery behavior against an isolated SQLite copy of the Prisma schema.
 * Scalar arrays/JSON/enums are simplified only in this disposable fixture;
 * production database connections and storage are never used.
 */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const { createRequire } = require("node:module")
const ts = require("typescript")
const web = path.resolve(__dirname, "..")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swimbuzz-recovery-"))
fs.writeFileSync(path.join(tmp, "test.db"), "")
const { installSoftDeletePolicy, withDeleted } = require("../soft-delete-policy")
function loadTS(relative, mocks) {
  const file = path.join(web, relative)
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const fallback = createRequire(file)
  new Function("require", "module", "exports", compiled)(id => id in mocks ? mocks[id] : fallback(id), mod, mod.exports)
  return mod.exports
}
async function main() {
  fs.symlinkSync(path.resolve(web, "../../node_modules"), path.join(tmp, "node_modules"), "dir")
  let schema = fs.readFileSync(path.join(web, "prisma/schema.prisma"), "utf8")
  const enums = [...schema.matchAll(/enum (\w+) \{[^}]+\}/g)].map(m => m[1])
  schema = schema.replace(/enum \w+ \{[^}]+\}/g, "")
    .replace('provider  = "postgresql"', 'provider  = "sqlite"')
    .replace('url       = env("DATABASE_URL")', `url = "file:${tmp}/test.db"`)
    .replace(/^\s*directUrl.*$/m, "")
    .replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n output = "${tmp}/client"`)
    .replace(/, type: Gin/g, "")
    .replace(/\bJson\b/g, "String")
  for (const name of enums) schema = schema.replace(new RegExp(`\\b${name}\\b`, "g"), "String")
  schema = schema.replace(/@default\(([A-Z][A-Z_]+)\)/g, '@default("$1")')
    .replace(/^(\s*\w+\s+)String\[\]([^\n]*)/gm, (_, prefix, rest) => `${prefix}String ${rest.includes("@default") ? rest.replace(/@default\(\[\]\)/, '@default("")') : '@default("")' + rest}`)
  const schemaPath = path.join(tmp, "schema.prisma")
  fs.writeFileSync(schemaPath, schema)
  const cli = require.resolve("prisma/build/index.js")
  for (const command of ["generate", "db push"]) {
    execFileSync(process.execPath, [cli, ...command.split(" "), "--schema", schemaPath], {
      cwd: web, stdio: "pipe", env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" },
    })
  }
  const { PrismaClient } = require(path.join(tmp, "client"))
  const prisma = installSoftDeletePolicy(new PrismaClient())
  let storageFailure = false
  let storageAttempts = 0
  const service = loadTS("src/lib/recovery/recovery.ts", {
    "@/lib/prisma": { prisma },
    "../../../soft-delete-policy": { withDeleted },
    "@/lib/meet/meet-storage": { deleteAllMeetFiles: async (_meet, options) => {
      assert.equal(options.strict, true)
      storageAttempts++
      if (storageFailure) throw new Error("Simulated storage failure")
    } },
    "@swimbuzz/shared": { RECOVERY_RETENTION_DAYS: 30 },
  })
  try {
    const user = await prisma.user.create({ data: { email: "recovery@example.test" } })
    const athlete = await prisma.athlete.create({ data: { userId: user.id, firstName: "Test", lastName: "Swimmer", gender: "MALE" } })
    const now = new Date()
    const practice = await prisma.practice.create({ data: { title: "Recover me", slug: "reserved-practice", startsAt: now, endsAt: now, published: true, sets: { create: { content: "Warmup" } } } })
    await prisma.practiceAttendance.create({ data: { practiceId: practice.id, athleteId: athlete.id } })
    await prisma.practiceComment.create({ data: { practiceId: practice.id, authorName: "Coach", body: "Keep this" } })
    await service.softDeletePractice(practice.id)
    assert.equal(await prisma.practice.findUnique({ where: { id: practice.id } }), null)
    assert.equal(await prisma.practice.count(), 0)
    assert.equal(await prisma.practiceSet.count(), 0)
    assert.equal(await prisma.practiceComment.count(), 0)
    assert.equal(await prisma.practiceAttendance.count(), 0)
    await assert.rejects(prisma.practice.update({ where: { id: practice.id }, data: { title: "Stale edit" } }))
    await assert.rejects(prisma.practiceComment.create({ data: { practiceId: practice.id, authorName: "Coach", body: "Stale comment" } }))
    const snapshot = await service.listRecentlyDeleted()
    assert.equal(snapshot.items[0].canRestore, true)
    const slug = loadTS("src/lib/slug.ts", { "@/lib/prisma": { prisma }, "../../soft-delete-policy": { withDeleted }, "@swimbuzz/shared": { zonedDayKey: () => "reserved-practice" } })
    assert.equal(await slug.uniquePracticeSlug(now, "UTC"), "reserved-practice-2")
    // A bypass in one asynchronous operation must never leak to a normal read.
    const [hidden, raw] = await Promise.all([prisma.practice.count(), withDeleted(() => prisma.practice.count())])
    assert.equal(hidden, 0); assert.equal(raw, 1)
    assert.equal(await service.restoreDeleted("practice", practice.id), true)
    assert.equal(await service.restoreDeleted("practice", practice.id), false)
    assert.equal(await prisma.practiceSet.count(), 1)
    assert.equal(await prisma.practiceAttendance.count(), 1)
    assert.equal(await prisma.practiceComment.count(), 1)
    assert.equal((await prisma.practice.findUnique({ where: { id: practice.id } })).published, true)

    const makeMeet = name => prisma.meet.create({ data: { name, slug: name, startsAt: now, season: "2026-2027", signupForm: { create: {} }, roomForm: { create: {} } }, include: { signupForm: true, roomForm: true } })
    const keep = await makeMeet("keep-swims")
    const both = await makeMeet("hide-swims")
    for (const [i, meet] of [keep, both].entries()) {
      await prisma.swim.create({ data: { athleteId: athlete.id, meetId: meet.id, meet: meet.name, event: "50 Free", timeMs: 25000 + i, course: "SCY", date: now, source: "test" } })
      await prisma.meetSignupEntry.create({ data: { formId: meet.signupForm.id, athleteId: athlete.id } })
      await prisma.$transaction(async tx => {
        const room = await tx.meetRoom.create({ data: { formId: meet.roomForm.id, label: "Room 1" } })
        await tx.meetRoomAssignment.createMany({ data: [{ roomId: room.id, athleteId: athlete.id }] })
      })
    }
    await service.softDeleteMeet(keep.id, false)
    await service.softDeleteMeet(both.id, true)
    assert.equal(await prisma.meet.count(), 0)
    assert.equal(await prisma.swim.count(), 1)
    assert.equal((await prisma.swim.aggregate({ _count: true }))._count, 1)
    assert.equal((await prisma.swim.groupBy({ by: ["meetId"], _count: true })).length, 1)
    assert.equal(await prisma.meetSignupEntry.count(), 0)
    assert.equal(await prisma.meetRoomAssignment.count(), 0)
    const nested = await prisma.athlete.findUnique({ where: { id: athlete.id }, include: { swims: { include: { meetRef: true } }, meetSignups: true, _count: true } })
    assert.equal(nested.swims.length, 1)
    assert.equal(nested.swims[0].meetRef, null)
    assert.equal(nested.meetSignups.length, 0)
    assert.equal(nested._count.swims, 1)
    assert.equal((await prisma.meetRoom.updateMany({ where: { formId: both.roomForm.id }, data: { label: "No" } })).count, 0)
    await assert.rejects(prisma.meetSignupEntry.create({ data: { formId: both.signupForm.id, athleteId: athlete.id } }))
    assert.equal(await slug.uniqueMeetSlug("hide-swims"), "hide-swims-2")
    assert.equal(await service.restoreDeleted("meet", both.id), true)
    assert.equal(await prisma.swim.count(), 2)
    assert.equal(await prisma.meetSignupEntry.count(), 1)
    assert.equal(await prisma.meetRoomAssignment.count(), 1)
    await service.softDeleteMeet(both.id, true)
    await service.softDeletePractice(practice.id)
    await withDeleted(async () => {
      const data = { purgeAfter: new Date(Date.now() - 1000) }
      await prisma.meet.updateMany({ data })
      await prisma.practice.updateMany({ data })
    })
    assert.equal(await service.restoreDeleted("meet", both.id), false)
    storageFailure = true
    const originalError = console.error
    console.error = () => {}
    let failed
    try { failed = await service.purgeRecentlyDeleted() } finally { console.error = originalError }
    assert.equal(failed.practices, 1)
    assert.equal(failed.failedMeets, 2)
    assert.equal(await withDeleted(() => prisma.meet.count()), 2)
    assert.equal(await withDeleted(() => prisma.practiceSet.count()), 0)
    // Even if a deadline is manually extended, claimed purge rows cannot restore.
    await withDeleted(() => prisma.meet.update({ where: { id: both.id }, data: { purgeAfter: new Date(Date.now() + 60000) } }))
    assert.equal(await service.restoreDeleted("meet", both.id), false)
    await withDeleted(() => prisma.meet.update({ where: { id: both.id }, data: { purgeAfter: new Date(Date.now() - 1000) } }))
    storageFailure = false
    const purged = await service.purgeRecentlyDeleted()
    assert.equal(purged.meets, 2)
    assert.equal(storageAttempts, 4)
    assert.equal(await withDeleted(() => prisma.meet.count()), 0)
    const remaining = await prisma.swim.findMany()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].meet, "keep-swims")
    assert.equal(remaining[0].meetId, null)
    assert.equal(await withDeleted(() => prisma.meetSignupEntry.count()), 0)
    assert.equal(await withDeleted(() => prisma.meetRoomAssignment.count()), 0)
    assert.equal((await service.purgeRecentlyDeleted()).meets, 0)

    // Permanent delete: purgeDeletedNow works on a live tombstone and is idempotent.
    const purgeNowPractice = await prisma.practice.create({ data: { title: "Purge me now", slug: "purge-me-now", startsAt: now, endsAt: now, published: true } })
    await service.softDeletePractice(purgeNowPractice.id)
    assert.equal(await service.purgeDeletedNow("practice", purgeNowPractice.id), true)
    assert.equal(await service.purgeDeletedNow("practice", purgeNowPractice.id), false)
    assert.equal(await withDeleted(() => prisma.practice.count({ where: { id: purgeNowPractice.id } })), 0)

    const purgeNowMeet = await makeMeet("purge-me-now")
    await service.softDeleteMeet(purgeNowMeet.id, false)
    assert.equal(await service.purgeDeletedNow("meet", purgeNowMeet.id), true)
    assert.equal(await service.purgeDeletedNow("meet", purgeNowMeet.id), false)
    assert.equal(await withDeleted(() => prisma.meet.count({ where: { id: purgeNowMeet.id } })), 0)

    let session = null
    const routes = loadTS("src/app/api/recently-deleted/route.ts", {
      "next/cache": { revalidatePath() {} }, "@/lib/auth/session": { getSession: async () => session },
      "@swimbuzz/shared": { isStaffRole: role => ["COACH", "EXEC"].includes(role) }, "@/lib/recovery/recovery": service,
    })
    const request = body => new Request("http://localhost/api/recently-deleted", { method: "POST", body: JSON.stringify(body) })
    for (const role of [null, "ATHLETE"]) {
      session = role ? { user: { role } } : null
      assert.equal((await routes.GET()).status, 403)
      assert.equal((await routes.POST(request({ kind: "meet", id: "missing" }))).status, 403)
      assert.equal((await routes.DELETE(request({ kind: "meet", id: "missing" }))).status, 403)
    }
    for (const role of ["COACH", "EXEC"]) {
      session = { user: { role } }
      assert.equal((await routes.GET()).status, 200)
      assert.equal((await routes.POST(request({ kind: "invalid", id: "x" }))).status, 400)
      assert.equal((await routes.POST(request({ kind: "meet", id: "missing" }))).status, 409)
      assert.equal((await routes.DELETE(request({ kind: "invalid", id: "x" }))).status, 400)
      assert.equal((await routes.DELETE(request({ kind: "meet", id: "missing" }))).status, 409)
    }
    console.log("Recovery checks passed: visibility, nested reads/counts, stale writes, slug reservation, restore, permanent delete, expiry, purge retries, swim preservation, and API permissions.")
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error.stdout?.toString() || "", error.stderr?.toString() || error); process.exitCode = 1 }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }))
