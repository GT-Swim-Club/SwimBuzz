/** The browser went away (reload or tab close) while an import request was still writing. */
export class ClientDisconnectedError extends Error {
  constructor() {
    super("Import cancelled because the page was closed")
    this.name = "ClientDisconnectedError"
  }
}

export function isClientDisconnected(err: unknown): err is ClientDisconnectedError {
  return err instanceof ClientDisconnectedError || (err instanceof Error && err.name === "ClientDisconnectedError")
}

/** Stop before the next write when the page that started this request is gone. */
export function throwIfDisconnected(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new ClientDisconnectedError()
}
