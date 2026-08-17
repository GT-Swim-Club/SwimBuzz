import { AppIcon } from "@/components/AppIcon"

export type TravelInfoKind =
  | "rideSignUps"
  | "rooms"
  | "hotel"
  | "packingList"
  | "itinerary"

const iconClass = "h-3.5 w-3.5 shrink-0"

export default function TravelInfoIcon({ kind }: { kind: TravelInfoKind }) {
  return <AppIcon name={kind} className={iconClass} />
}
