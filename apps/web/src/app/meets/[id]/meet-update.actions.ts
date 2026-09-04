"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { buildMeetData, MeetInputError, toPrismaMeetWriteData } from "@/lib/meet/meet-input"
import {
  deleteAddedMeetFiles,
  deleteAllMeetFiles,
  deleteRemovedMeetFiles,
  deleteStoredMeetFile,
  type MeetStoredFiles,
} from "@/lib/meet/meet-storage"
import { resolveEventOrderForPacket } from "@/lib/meet/meet-packet-parse"
import { attachSheetSummaries } from "@/lib/meet/meet-sheet-resolve"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete/athlete-match"
import { MeetImportValidationError } from "@/lib/meet/meet-import-validate"
import {
  detectMeetResourceDrops,
  notifyMeetRosterOfInfoDrops } from "@/lib/meet/meet-roster-notify"
import { LOCAL_SCRAPER_HINT } from "@/lib/scraper/scraper"
import { uniqueMeetSlug } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

/** Shared with PATCH/DELETE /api/meets/[id] (also called by mobile) — same
 * logic, kept in sync manually since the route can't be refactored without
 * risking the mobile-facing contract. Used by every meet-editing form
 * (MeetActions, EditMeetButton, AddTravelInfoButton, ManagePhotosButton,
 * ImportMeetResourcesButton) so the PATCH body-building logic lives once. */

export type UpdateMeetResult =
  | {
      ok: true
      meet: Awaited<ReturnType<typeof prisma.meet.update>>
      nameConfirmations?: unknown
      rosterForPairing?: unknown
      cachedSheetParses?: unknown
    }
  | { ok: false; error: string; rejected?: boolean }

export async function updateMeet(
  meetId: string,
  body: Record<string, unknown>
): Promise<UpdateMeetResult> {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return { ok: false, error: "Forbidden" }
  }

  const existing = await prisma.meet.findUnique({ where: { id: meetId } })
  if (!existing) return { ok: false, error: "Not found" }

  const nameMappings = normalizeNameMappings(body.nameMappings)
  const rejectedNames = normalizeRejectedNames(body.rejectedNames)
  const cachedSheetParses =
    (body.cachedSheetParses as Record<string, unknown> | null) ?? null

  let data: Record<string, unknown> | null = null
  try {
    data = buildMeetData(body, {
      existing: {
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        timeZone: existing.timeZone,
        hasStartTime: existing.hasStartTime,
      },
    })
    if (Object.keys(data).length === 0) {
      return { ok: false, error: "No valid fields to update" }
    }

    let packetParsed = false
    if ("packetUrl" in data) {
      const nextPacket = (data.packetUrl as string | null) ?? null
      if (nextPacket !== existing.packetUrl) {
        if (!nextPacket) {
          data.eventOrder = null
        } else {
          try {
            data.eventOrder = await resolveEventOrderForPacket(session.user.id, nextPacket)
            packetParsed = true
          } catch (err) {
            console.error("Meet packet parse failed:", err)
            data.eventOrder = null
          }
        }
      }
    }

    const {
      nameConfirmations,
      rosterForPairing,
      cachedSheetParses: nextCachedSheetParses,
      sheetDrops,
    } = await attachSheetSummaries(session.user.id, existing, data, {
      nameMappings,
      rejectedNames,
      cachedSheetParses,
    })

    if (typeof data.name === "string" && data.name !== existing.name) {
      data.slug = await uniqueMeetSlug(data.name, meetId)
    }

    const resourceDrops = detectMeetResourceDrops(existing, data, { packetParsed })

    const meet = await prisma.meet.update({
      where: { id: meetId },
      data: toPrismaMeetWriteData(data),
    })
    await deleteRemovedMeetFiles(existing as MeetStoredFiles, data)

    void notifyMeetRosterOfInfoDrops({
      meetId: meet.id,
      meetName: meet.name,
      drops: [...sheetDrops, ...resourceDrops]})

    revalidatePath("/meets/[id]", "page")
    revalidatePath("/meets", "page")

    return {
      ok: true,
      meet,
      nameConfirmations,
      rosterForPairing,
      cachedSheetParses: nextCachedSheetParses,
    }
  } catch (err) {
    if (err instanceof MeetInputError) {
      return { ok: false, error: err.message }
    }
    if (err instanceof MeetImportValidationError) {
      if (data) {
        await deleteAddedMeetFiles(existing as MeetStoredFiles, data).catch((deleteErr) => {
          console.error("Failed to delete rejected meet uploads:", deleteErr)
        })
      }
      return { ok: false, error: err.message, rejected: true }
    }
    const message = err instanceof Error ? err.message : "Failed to save meet"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return { ok: false, error: LOCAL_SCRAPER_HINT }
    }
    return { ok: false, error: message }
  }
}

export async function deleteMeetEntirely(
  meetId: string,
  options: { deleteMeet: boolean; deleteSwims: boolean }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const existing = await prisma.meet.findUnique({ where: { id: meetId } })
  if (!existing) throw new Error("Not found")

  const { deleteMeet: shouldDeleteMeet, deleteSwims } = options

  if (deleteSwims) {
    await prisma.swim.deleteMany({ where: { meetId } })
    await prisma.meet.update({
      where: { id: meetId },
      data: {
        relayResultsSummary: { entries: [] },
        resultsUrl: null,
        swimphoneUrl: null,
        resultStatusesSummary: { entries: [] },
      },
    })
  }

  if (shouldDeleteMeet) {
    try {
      await deleteAllMeetFiles(existing as MeetStoredFiles)
    } catch (err) {
      console.error("Failed to delete stored files for meet", meetId, err)
    }
    await prisma.meet.delete({ where: { id: meetId } })
  } else if (deleteSwims) {
    try {
      await deleteStoredMeetFile(existing.resultsUrl)
    } catch (err) {
      console.error("Failed to delete results file for meet", meetId, err)
    }
  }

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets", "page")
  return { ok: true, deletedMeet: shouldDeleteMeet }
}
