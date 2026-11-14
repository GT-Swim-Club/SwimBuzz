import { after } from "next/server"

/**
 * Run notification work once the response is sent, without losing it: on Vercel a bare
 * `void promise` can be frozen with the function, while `after()` keeps it alive (waitUntil).
 * Outside a request (scripts, tests) it simply runs in the background. Errors are logged.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task()
    } catch (err) {
      console.error(`[notifications] ${label} failed:`, err)
    }
  }
  try {
    after(run)
  } catch {
    void run()
  }
}
