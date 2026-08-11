const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "Jun 28, 2025" — fixed format, not locale-dependent
export function formatSwimDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// "Jun 28, 2025" or "Jun 28 – 30, 2025" / "Dec 30, 2025 – Jan 2, 2026"
export function formatOrdinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

export function podiumPlaceClass(place: number): string {
  switch (place) {
    case 1:
      return "text-amber-600 dark:text-amber-400 font-semibold"
    case 2:
      return "text-slate-500 dark:text-slate-300 font-semibold"
    case 3:
      return "text-orange-600 dark:text-orange-400 font-semibold"
    default:
      return "text-foreground-tertiary dark:text-foreground-tertiary"
  }
}

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

/** Display swim times with exactly 2 decimals. NT stays NT; non-time text is unchanged. */
export function formatDisplayTime(input: string): string {
  const time = input.trim()
  if (!time) return time
  if (/^nt$/i.test(time)) return "NT"
  if (!/^[\d:.]+$/.test(time)) return time

  const parts = time.split(":")
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10)
    const sec = parseFloat(parts[1])
    if (!Number.isFinite(minutes) || !Number.isFinite(sec) || minutes < 0 || sec < 0) {
      return time
    }
    return `${minutes}:${sec.toFixed(2).padStart(5, "0")}`
  }
  if (parts.length === 1) {
    const sec = parseFloat(parts[0])
    if (!Number.isFinite(sec) || sec < 0) return time
    if (sec >= 60) return formatTime(sec * 1000)
    return sec.toFixed(2)
  }
  return time
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

export function toTitleCase(str: string): string {
  if (!str) return str
  return str
    .toLowerCase()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase())
}

export function formatAcademicYear(year: string): string {
  if (year.toLowerCase().includes("phd")) return "PhD"
  if (year.toLowerCase().includes("master")) return "Masters"
  const num = parseInt(year)
  if (isNaN(num)) return year
  return `${formatOrdinal(num)} Year`
}

export function athleteAge(dob: Date | string | null | undefined): number | null {
  if (!dob) return null
  const birth = typeof dob === "string" ? new Date(dob) : dob
  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth()
  const dayDiff = today.getUTCDate() - birth.getUTCDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--
  return age >= 0 ? age : null
}

export function formatAthleteYearAndAge(
  year: string | null | undefined,
  dob: Date | string | null | undefined,
): string | null {
  const yearPart = year ? formatAcademicYear(year) : null
  const age = athleteAge(dob)
  const agePart = age != null ? String(age) : null

  if (yearPart && agePart) return `${yearPart} · ${agePart}`
  if (yearPart) return yearPart
  if (agePart) return agePart
  return null
}
