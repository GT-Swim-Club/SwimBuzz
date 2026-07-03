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

// "Jun 28, 2025, 3:04 PM" — for last-synced timestamps
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  let hours = d.getHours()
  const minutes = d.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hours}:${minutes} ${ampm}`
}

// concise relative time, e.g. "just now", "5m ago", "3h ago", "2d ago"
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 45) return "just now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.round(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(mo / 12)}y ago`
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