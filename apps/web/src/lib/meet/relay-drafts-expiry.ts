import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * Relay builder drafts (and the settings saved with them) only matter until the meet ends, when
 * the builder closes. Delete them the first time an ended meet is viewed — no cron needed.
 */
export async function deleteEndedMeetRelayDrafts(
  meet: { id: string; relayDrafts: Prisma.JsonValue | null },
  ended: boolean
): Promise<void> {
  if (!ended || meet.relayDrafts == null) return
  try {
    await prisma.meet.update({ where: { id: meet.id }, data: { relayDrafts: Prisma.DbNull } })
  } catch (err) {
    // Retried on the next view; never worth failing the page over.
    console.error("[relay-drafts] couldn't delete drafts for ended meet", meet.id, err)
  }
}
