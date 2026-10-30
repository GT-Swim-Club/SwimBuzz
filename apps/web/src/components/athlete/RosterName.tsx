import { splitRosterName } from "@swimbuzz/shared"

/** "Last, First (Preferred)" with the preferred name muted, like the roster page. */
export default function RosterName({ name }: { name: string }) {
  const { name: base, preferred } = splitRosterName(name)
  return (
    <>
      {base}
      {preferred ? <span className="font-normal text-foreground-secondary"> ({preferred})</span> : null}
    </>
  )
}
