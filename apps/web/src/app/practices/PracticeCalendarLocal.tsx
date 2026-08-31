function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function getLocalDayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getLocalWeekStartKey(date = new Date()) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  day.setDate(day.getDate() - day.getDay())
  return getLocalDayKey(day)
}
