import { AppIcon } from "@/components/AppIcon"

export type MeetResourceKind =
  | "packet"
  | "eventOrder"
  | "entries"
  | "psych"
  | "heat"
  | "results"
  | "liveStream"
  | "photos"

const iconClass = "h-3.5 w-3.5 shrink-0"

const kindToName = {
  packet: "packet",
  eventOrder: "eventOrder",
  entries: "entries",
  psych: "psych",
  heat: "heat",
  results: "trophy",
  liveStream: "liveStream",
  photos: "photos",
} as const

export default function MeetResourceIcon({ kind }: { kind: MeetResourceKind }) {
  return <AppIcon name={kindToName[kind]} className={iconClass} />
}
