import { NextResponse } from "next/server"
import { isClientDisconnected } from "@/lib/client-disconnect"

/** Content type a client sends in `Accept` to receive live progress instead of a single JSON body. */
export const IMPORT_STREAM_TYPE = "application/x-ndjson"

export type ImportStreamProgress = {
  /** 0–1 completion across the whole import */
  progress: number
  detail: string
}

/** One line of the progress stream. */
export type ImportStreamEvent =
  | ({ type: "progress" } & ImportStreamProgress)
  | { type: "result"; data: Record<string, unknown> }
  | { type: "error"; error: string }

export function wantsImportStream(req: Request) {
  return (req.headers.get("accept") ?? "").includes(IMPORT_STREAM_TYPE)
}

/**
 * Run an import and stream its progress as newline-delimited JSON events,
 * ending with a `result` or `error` event. The 200 status is sent up front, so
 * failures arrive as an `error` event rather than a status code.
 */
export function streamImport(
  run: (onProgress: (progress: ImportStreamProgress) => void) => Promise<Record<string, unknown>>,
  {
    label,
    failureMessage,
  }: {
    /** Log prefix, e.g. "roster import". */
    label: string
    /** The error the user sees: a fixed message, or one picked from the thrown error. */
    failureMessage: string | ((err: unknown) => string)
  }
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ImportStreamEvent) =>
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
        console.error(`[${label}] failed:`, err)
        try {
          send({
            type: "error",
            error: typeof failureMessage === "string" ? failureMessage : failureMessage(err),
          })
        } catch {
          // The browser already went away.
        }
      }
      controller.close()
    },
  })
  return new NextResponse(stream, {
    headers: { "Content-Type": IMPORT_STREAM_TYPE, "Cache-Control": "no-store, no-transform" },
  })
}

/** Map a step's own 0–1 progress into its `from`–`to` share of the whole import's bar. */
export function scaleProgress(
  onProgress: ((progress: ImportStreamProgress) => void) | undefined,
  from: number,
  to: number
): ((progress: ImportStreamProgress) => void) | undefined {
  if (!onProgress) return undefined
  return ({ progress, detail }) => onProgress({ progress: from + (to - from) * progress, detail })
}

/**
 * While a step that can't report its own progress runs (a PDF parse), ease the bar from
 * `from` toward `to` so it never looks stuck: about 85% of the way after `expectedMs`,
 * never quite reaching `to`. Call the returned function when the step finishes.
 */
export function creepProgress(
  onProgress: ((progress: ImportStreamProgress) => void) | undefined,
  { from, to, detail, expectedMs }: { from: number; to: number; detail: string; expectedMs: number }
): () => void {
  if (!onProgress) return () => {}
  const startedAt = Date.now()
  const tick = () => {
    const elapsed = Date.now() - startedAt
    const eased = 1 - Math.exp((-2 * elapsed) / expectedMs)
    onProgress({ progress: from + (to - from) * eased, detail })
  }
  tick()
  const timer = setInterval(tick, 500)
  return () => clearInterval(timer)
}
