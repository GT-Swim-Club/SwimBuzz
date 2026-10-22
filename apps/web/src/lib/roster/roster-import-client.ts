import type { ImportTaskProgress } from "@/components/ui/ImportTaskProvider"
import { ROSTER_IMPORT_STREAM_TYPE, type RosterImportStreamEvent } from "@/lib/roster/roster-import-stream"

/**
 * POST a roster import and report its streamed progress. Resolves with the
 * final result payload; throws with the server's message on failure.
 */
export async function postRosterImport<T>(
  url: string,
  init: { body: BodyInit; headers?: Record<string, string> },
  report: (progress: ImportTaskProgress) => void
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    body: init.body,
    headers: { ...init.headers, Accept: ROSTER_IMPORT_STREAM_TYPE },
  })

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Import failed")
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffered = ""
  let result: T | undefined

  const handle = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as RosterImportStreamEvent
    if (event.type === "progress") report({ progress: event.progress, detail: event.detail })
    else if (event.type === "error") throw new Error(event.error)
    else result = event.data as T
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffered += value
    const lines = buffered.split("\n")
    buffered = lines.pop() ?? ""
    lines.forEach(handle)
  }
  handle(buffered)

  if (result === undefined) throw new Error("Import ended unexpectedly")
  return result
}
