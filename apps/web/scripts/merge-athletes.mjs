/**
 * Merge a duplicate athlete record into the one to keep. Read-only unless --apply.
 *
 *   node scripts/merge-athletes.mjs --find Cochell
 *       Lists athletes with that last name (login email, seasons, swims) and suggests a
 *       command, keeping the one whose login is a @gatech.edu address.
 *
 *   node scripts/merge-athletes.mjs --keep <athleteId> --drop <athleteId>
 *       Dry run: prints everything that would move. Add --apply to do it.
 *
 * Applying moves onto the kept athlete: swims (an exact duplicate — same event, time, course,
 * date, round and occurrence — is dropped instead), meet sign-ups, room preferences and
 * assignments, practice attendance and notifications (where both have a row for the same form,
 * room or practice, the kept one's stays); clearance (each check complete if either was); seasons,
 * academic years, SwimCloud profiles and blank fields (preferred name, GTID, DOB); and every
 * athlete id held in a JSON or string-list column (meet rosters, relay results and drafts,
 * result teams, heat/lane overrides, team records, roommate preferences). It then deletes the
 * duplicate and, when it's a plain athlete login (no staff title), its user account — after
 * moving that account's notifications and practice comments to the kept athlete's account.
 * Uses its own Prisma client, so soft-deleted meets are covered too. Team records re-sync inside
 * the app (it needs Next's cache): afterwards, open the kept athlete, Edit athlete → Save changes.
 */
import { PrismaClient, Prisma } from "@prisma/client"

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const apply = args.includes("--apply")
const find = flag("--find")
const keepId = flag("--keep")
const dropId = flag("--drop")

const prisma = new PrismaClient()

function databaseHost() {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(unknown)"
  } catch {
    return "(unparseable DATABASE_URL)"
  }
}

const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`

async function describe(athleteId) {
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    include: {
      user: { select: { id: true, email: true, role: true, staffTitle: true, createdAt: true } },
      clearance: true,
      _count: {
        select: {
          swims: true,
          meetSignups: true,
          meetRoomPreferences: true,
          meetRoomAssignments: true,
          practiceAttendance: true,
        },
      },
    },
  })
  if (!athlete) throw new Error(`No athlete with id ${athleteId}`)
  return athlete
}

function summary(a) {
  return [
    `  id            ${a.id}`,
    `  name          ${a.firstName}${a.preferredName ? ` (${a.preferredName})` : ""} ${a.lastName}   slug ${a.slug ?? "—"}`,
    `  login         ${a.user?.email ?? "—"}  (${a.user?.role ?? "?"}${a.user?.staffTitle ? `, ${a.user.staffTitle}` : ""}; created ${a.user?.createdAt?.toISOString().slice(0, 10) ?? "?"})`,
    `  gender        ${a.gender}   seasons ${a.seasons.join(", ") || "—"}`,
    `  GTID / DOB    ${a.gtid ?? "—"} / ${a.dob?.toISOString().slice(0, 10) ?? "—"}   SwimCloud ${a.swimCloudIds.join(", ") || "—"}`,
    `  swims ${a._count.swims} · sign-ups ${a._count.meetSignups} · room prefs ${a._count.meetRoomPreferences} · rooms ${a._count.meetRoomAssignments} · attendance ${a._count.practiceAttendance}`,
  ].join("\n")
}

async function findAthletes(lastName) {
  const athletes = await prisma.athlete.findMany({
    where: { lastName: { equals: lastName, mode: "insensitive" } },
    select: { id: true },
    orderBy: [{ firstName: "asc" }],
  })
  if (athletes.length === 0) {
    console.log(`No athletes with last name "${lastName}".`)
    return
  }
  const described = []
  for (const { id } of athletes) {
    const a = await describe(id)
    described.push(a)
    console.log(`\n${summary(a)}`)
  }
  const gatech = described.filter((a) => a.user?.email?.toLowerCase().endsWith("@gatech.edu"))
  if (described.length === 2 && gatech.length === 1) {
    const keep = gatech[0]
    const drop = described.find((a) => a.id !== keep.id)
    console.log(
      `\nSuggested (keeps the @gatech.edu login):\n  node scripts/merge-athletes.mjs --keep ${keep.id} --drop ${drop.id}`
    )
  }
}

/** Every JSON and String[] column, from the Prisma schema (models other than Athlete). */
function idColumns() {
  const out = []
  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.name === "Athlete") continue
    for (const field of model.fields) {
      if (field.kind !== "scalar") continue
      const kind = field.type === "Json" ? "json" : field.type === "String" && field.isList ? "list" : null
      if (!kind) continue
      out.push({ model: model.name, table: model.dbName ?? model.name, column: field.dbName ?? field.name, kind })
    }
  }
  return out
}

function uniqueInOrder(values) {
  return [...new Set(values)]
}

async function plan(keep, drop) {
  const lines = []
  const swimKey = (s) => [s.event, s.timeMs, s.course, s.date.toISOString(), s.tags, s.occurrence].join("|")
  const keepSwims = await prisma.swim.findMany({ where: { athleteId: keep.id } })
  const dropSwims = await prisma.swim.findMany({ where: { athleteId: drop.id } })
  const keepKeys = new Set(keepSwims.map(swimKey))
  const duplicateSwims = dropSwims.filter((s) => keepKeys.has(swimKey(s)))
  const movedSwims = dropSwims.filter((s) => !keepKeys.has(swimKey(s)))
  // Same event and time at the same meet but not identical (another round tag or date): left for review.
  const looseKey = (s) => [s.event, s.timeMs, s.course, s.meetId ?? s.meet ?? ""].join("|")
  const keepLoose = new Set(keepSwims.map(looseKey))
  const nearDuplicates = movedSwims.filter((s) => keepLoose.has(looseKey(s)))
  lines.push(`Swims: move ${movedSwims.length}, drop ${duplicateSwims.length} exact duplicate(s).`)
  for (const s of nearDuplicates) {
    lines.push(`  ! kept athlete already has ${s.event} ${s.course} ${s.timeMs}ms at "${s.meet ?? s.meetId}" (tags/date differ) — both kept, review after`)
  }

  const pairs = [
    ["meetSignupEntry", "formId", "meet sign-ups"],
    ["meetRoomPreference", "formId", "room preferences"],
    ["meetRoomAssignment", "roomId", "room assignments"],
    ["practiceAttendance", "practiceId", "practice attendance"],
  ]
  const rowMoves = []
  for (const [model, key, label] of pairs) {
    const keepRows = await prisma[model].findMany({ where: { athleteId: keep.id }, select: { [key]: true } })
    const taken = new Set(keepRows.map((r) => r[key]))
    const dropRows = await prisma[model].findMany({ where: { athleteId: drop.id }, select: { id: true, [key]: true } })
    const move = dropRows.filter((r) => !taken.has(r[key])).map((r) => r.id)
    const discard = dropRows.filter((r) => taken.has(r[key])).map((r) => r.id)
    rowMoves.push({ model, move, discard })
    if (dropRows.length) lines.push(`${label}: move ${move.length}, drop ${discard.length} (kept athlete already has one there).`)
  }
  const notifications = await prisma.notification.count({ where: { athleteId: drop.id } })
  if (notifications) lines.push(`Notifications about the athlete: repoint ${notifications}.`)

  if (drop.clearance) {
    lines.push(
      keep.clearance
        ? `Clearance: physical ${keep.clearance.physicalCleared || drop.clearance.physicalCleared ? "complete" : "incomplete"}, concussion ${keep.clearance.concussionCleared || drop.clearance.concussionCleared ? "complete" : "incomplete"} (either record's completion counts).`
        : "Clearance: move the duplicate's row."
    )
  }

  const athleteData = {
    seasons: uniqueInOrder([...keep.seasons, ...drop.seasons]).sort(),
    yearBySeason: { ...(drop.yearBySeason ?? {}), ...(keep.yearBySeason ?? {}) },
    swimCloudIds: uniqueInOrder([...keep.swimCloudIds, ...drop.swimCloudIds]).slice(0, 5),
    swimCloudSyncedMeetIds: uniqueInOrder([...keep.swimCloudSyncedMeetIds, ...drop.swimCloudSyncedMeetIds]),
    preferredName: keep.preferredName ?? drop.preferredName,
    gtid: keep.gtid ?? drop.gtid,
    dob: keep.dob ?? drop.dob,
    year: keep.year ?? drop.year,
    timesSyncedAt:
      keep.timesSyncedAt && drop.timesSyncedAt
        ? new Date(Math.max(keep.timesSyncedAt.getTime(), drop.timesSyncedAt.getTime()))
        : keep.timesSyncedAt ?? drop.timesSyncedAt,
  }
  lines.push(
    `Kept athlete becomes: seasons ${athleteData.seasons.join(", ")}; SwimCloud ${athleteData.swimCloudIds.join(", ") || "—"}; ` +
      `preferred name ${athleteData.preferredName ?? "—"}; GTID ${athleteData.gtid ?? "—"}; DOB ${athleteData.dob?.toISOString().slice(0, 10) ?? "—"}.`
  )
  if (drop.swimCloudIds.length + keep.swimCloudIds.length > 5) {
    lines.push("  ! more than 5 SwimCloud profiles between them — only the first 5 are kept")
  }

  const columns = []
  for (const c of idColumns()) {
    const where =
      c.kind === "json"
        ? `${quote(c.column)}::text LIKE '%' || $1 || '%'`
        : `$1 = ANY(${quote(c.column)})`
    const [{ count }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM ${quote(c.table)} WHERE ${where}`,
      drop.id
    )
    if (count > 0) {
      columns.push(c)
      lines.push(`${c.model}.${c.column}: rewrite the athlete id in ${count} row(s).`)
    }
  }

  const user = drop.user
  const deleteUser = user && user.role === "ATHLETE" && user.staffTitle == null
  if (user) {
    const [userNotifications, comments, ownedPractices] = await Promise.all([
      prisma.notification.count({ where: { userId: user.id } }),
      prisma.practiceComment.count({ where: { authorId: user.id } }),
      prisma.practice.count({ where: { ownerId: user.id } }),
    ])
    if (deleteUser && ownedPractices > 0) {
      lines.push(`  ! the login owns ${ownedPractices} private practice(s), which deleting it would delete too`)
    }
    lines.push(
      deleteUser
        ? `Login ${user.email}: delete it, after moving its ${userNotifications} notification(s) and ${comments} practice comment(s) to ${keep.user?.email ?? "the kept account"}.`
        : `Login ${user.email}: kept (it's a staff account), just unlinked from the athlete.`
    )
  }
  lines.push(`Delete the duplicate athlete ${drop.id} (${drop.slug ?? "no slug"}).`)
  const swapSlug =
    drop.slug && keep.slug && keep.slug.startsWith(`${drop.slug}-`) && /^\d+$/.test(keep.slug.slice(drop.slug.length + 1))
  if (swapSlug) lines.push(`Profile URL: /athletes/${keep.slug} becomes /athletes/${drop.slug}.`)

  return { lines, movedSwims, duplicateSwims, rowMoves, athleteData, columns, deleteUser, swapSlug }
}

async function applyMerge(keep, drop, p) {
  await prisma.$transaction(
    async (tx) => {
      if (p.duplicateSwims.length) {
        await tx.swim.deleteMany({ where: { id: { in: p.duplicateSwims.map((s) => s.id) } } })
      }
      if (p.movedSwims.length) {
        await tx.swim.updateMany({ where: { id: { in: p.movedSwims.map((s) => s.id) } }, data: { athleteId: keep.id } })
      }
      for (const { model, move, discard } of p.rowMoves) {
        if (discard.length) await tx[model].deleteMany({ where: { id: { in: discard } } })
        if (move.length) await tx[model].updateMany({ where: { id: { in: move } }, data: { athleteId: keep.id } })
      }
      await tx.notification.updateMany({ where: { athleteId: drop.id }, data: { athleteId: keep.id } })

      if (drop.clearance) {
        if (keep.clearance) {
          await tx.athleteClearance.update({
            where: { athleteId: keep.id },
            data: {
              physicalCleared: keep.clearance.physicalCleared || drop.clearance.physicalCleared,
              concussionCleared: keep.clearance.concussionCleared || drop.clearance.concussionCleared,
            },
          })
          await tx.athleteClearance.delete({ where: { athleteId: drop.id } })
        } else {
          await tx.athleteClearance.update({ where: { athleteId: drop.id }, data: { athleteId: keep.id } })
        }
      }

      for (const c of p.columns) {
        if (c.kind === "json") {
          await tx.$executeRawUnsafe(
            `UPDATE ${quote(c.table)} SET ${quote(c.column)} = replace(${quote(c.column)}::text, $1, $2)::jsonb
             WHERE ${quote(c.column)}::text LIKE '%' || $1 || '%'`,
            drop.id,
            keep.id
          )
        } else {
          const rows = await tx.$queryRawUnsafe(
            `SELECT id, ${quote(c.column)} AS list FROM ${quote(c.table)} WHERE $1 = ANY(${quote(c.column)})`,
            drop.id
          )
          for (const row of rows) {
            const next = uniqueInOrder(row.list.map((v) => (v === drop.id ? keep.id : v)))
            await tx.$executeRawUnsafe(
              `UPDATE ${quote(c.table)} SET ${quote(c.column)} = $1 WHERE id = $2`,
              next,
              row.id
            )
          }
        }
      }

      const user = drop.user
      if (user && p.deleteUser) {
        if (keep.user) {
          await tx.notification.updateMany({ where: { userId: user.id }, data: { userId: keep.user.id } })
          await tx.practiceComment.updateMany({ where: { authorId: user.id }, data: { authorId: keep.user.id } })
        }
      }

      const remaining = await tx.swim.count({ where: { athleteId: drop.id } })
      if (remaining > 0) throw new Error(`${remaining} swim(s) still on the duplicate — nothing was changed`)
      await tx.athlete.delete({ where: { id: drop.id } })
      if (user && p.deleteUser) await tx.user.delete({ where: { id: user.id } })

      await tx.athlete.update({
        where: { id: keep.id },
        data: { ...p.athleteData, ...(p.swapSlug ? { slug: drop.slug } : {}) },
      })
    },
    { timeout: 120_000, maxWait: 20_000 }
  )
}

try {
  console.log(`Database: ${databaseHost()}${apply ? "" : "   (dry run — nothing is changed without --apply)"}`)
  if (find) {
    await findAthletes(find)
  } else if (keepId && dropId) {
    if (keepId === dropId) throw new Error("--keep and --drop are the same athlete")
    const keep = await describe(keepId)
    const drop = await describe(dropId)
    console.log(`\nKEEP\n${summary(keep)}\n\nMERGE IN AND DELETE\n${summary(drop)}\n`)
    if (keep.lastName.toLowerCase() !== drop.lastName.toLowerCase() || keep.gender !== drop.gender) {
      console.log("! Last names or genders differ — double-check these are the same person.\n")
    }
    const p = await plan(keep, drop)
    console.log(p.lines.map((l) => (l.startsWith("  ") ? l : `• ${l}`)).join("\n"))
    if (apply) {
      await applyMerge(keep, drop, p)
      console.log(
        `\nMerged. ${keep.firstName} ${keep.lastName} is ${keep.id}.\n` +
          "Team records and Top 10s re-sync inside the app: open the athlete on the web, Edit athlete → Save changes."
      )
    } else {
      console.log("\nRe-run with --apply to merge.")
    }
  } else {
    console.log("Usage:\n  node scripts/merge-athletes.mjs --find <lastName>\n  node scripts/merge-athletes.mjs --keep <id> --drop <id> [--apply]")
  }
} catch (err) {
  console.error(`\nError: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
