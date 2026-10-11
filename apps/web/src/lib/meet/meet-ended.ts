/** True once the meet's last day (endsAt, else startsAt) is before today. */
export function meetHasEnded(opts: {
  startsAt: Date
  endsAt: Date | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const lastActiveDate = new Date(opts.endsAt ?? opts.startsAt)
  lastActiveDate.setHours(0, 0, 0, 0)
  return lastActiveDate <= yesterday
}
