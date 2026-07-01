const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "Jun 28, 2025" — fixed format, not locale-dependent
export function formatSwimDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
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