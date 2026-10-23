import { NextResponse } from "next/server"
import { isClientDisconnected } from "@/lib/client-disconnect"
import type { RosterImportProgress } from "@/lib/roster/roster-import"

/** Content type a client sends in `Accept` to receive live progress instead of a single JSON body. */
export const ROSTER_IMPORT_STREAM_TYPE = "application/x-ndjson"

/** One line of the progress stream. */
export type RosterImportStreamEvent =
  | ({ type: "progress" } & RosterImportProgress)
  | { type: "result"; data: Record<string, unknown> }
  | { type: "error"; error: string }

export function wantsRosterImportStream(req: Request) {
  return (req.headers.get("accept") ?? "").includes(ROSTER_IMPORT_STREAM_TYPE)
}

/**
 * Run a roster import and stream its progress as newline-delimited JSON events,
 * ending with a `result` or `error` event. The 200 status is sent up front, so
 * failures arrive as an `error` event rather than a status code.
 */
export function streamRosterImport(
  run: (onProgress: (progress: RosterImportProgress) => void) => Promise<Record<string, unknown>>,
  failureMessage: string
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RosterImportStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        const data = await run((progress) => send({ type: "progress", ...progress }))
        send({ type: "result", data })
      } catch (err) {
        if (isClientDisconnected(err)) {
          try {
            controller.close()
          } catch {
            // The browser already went away.
          }
          return
        }
        console.error("[roster import] failed:", err)
        try {
          send({ type: "error", error: failureMessage })
        } catch {
          // The browser already went away.
        }
      }
      controller.close()
    },
  })
  return new NextResponse(stream, {
    headers: { "Content-Type": ROSTER_IMPORT_STREAM_TYPE, "Cache-Control": "no-store, no-transform" },
  })
}
