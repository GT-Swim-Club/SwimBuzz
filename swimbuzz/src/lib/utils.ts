const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "Jun 28, 2025" — fixed format, not locale-dependent
export function formatSwimDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// "Jun 28, 2025" or "Jun 28 – 30, 2025" / "Dec 30, 2025 – Jan 2, 2026"
export function formatDateRange(
  start: Date | string,
  end?: Date | string | null
): string {
  const s = typeof start === "string" ? new Date(start) : start
  if (!end) return formatSwimDate(s)
  const e = typeof end === "string" ? new Date(end) : end
  if (s.getTime() === e.getTime()) return formatSwimDate(s)

  const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth()
  if (sameMonth) {
    return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()} – ${e.getUTCDate()}, ${e.getUTCFullYear()}`
  }
  if (sameYear) {
    return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()} – ${MONTHS[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`
  }
  return `${formatSwimDate(s)} – ${formatSwimDate(e)}`
}

function formatTimeOfDay(d: Date): string {
  let hours = d.getHours()
  const minutes = d.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  return `${hours}:${minutes} ${ampm}`
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// "Jun 28, 2025, 3:04 PM" — for last-synced timestamps
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${formatTimeOfDay(d)}`
}

// "just now" if <45s, same day → "3:04 PM", yesterday → "Yesterday at 3:04 PM", else date + time
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  if (Math.round(diffMs / 1000) < 45) return "just now"

  const now = new Date()
  const dayDiff = Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(d).getTime()) / (24 * 60 * 60 * 1000)
  )
  const time = formatTimeOfDay(d)
  if (dayDiff === 0) return time
  if (dayDiff === 1) return `Yesterday at ${time}`
  return formatDateTime(d)
}

// converts milliseconds to "1:23.45" or "58.32"
export function formatTime(ms: number): string {
    const totalSeconds = ms / 1000
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0")
    return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}`
  }
  
  // converts "1:23.45" or "58.32" to milliseconds
  export function parseTime(input: string): number {
    const parts = input.trim().split(":")
    if (parts.length === 2) {
      return (parseInt(parts[0]) * 60 + parseFloat(parts[1])) * 1000
    }
    return parseFloat(parts[0]) * 1000
  }

/** Signed delta vs seed — negative is a drop (faster), positive is slower. */
export function formatSeedTimeDelta(seed: string, result: string): string | null {
  const seedMs = parseTime(seed)
  const resultMs = parseTime(result)
  if (!Number.isFinite(seedMs) || !Number.isFinite(resultMs) || seedMs <= 0 || resultMs <= 0) {
    return null
  }
  const deltaMs = resultMs - seedMs
  if (deltaMs === 0) return null

  const sign = deltaMs < 0 ? "-" : "+"
  const absSec = Math.abs(deltaMs) / 1000
  if (absSec < 60) return `${sign}${absSec.toFixed(2)}`
  const minutes = Math.floor(absSec / 60)
  const seconds = (absSec % 60).toFixed(2).padStart(5, "0")
  return `${sign}${minutes}:${seconds}`
}