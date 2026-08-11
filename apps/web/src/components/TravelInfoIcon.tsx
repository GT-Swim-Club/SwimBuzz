export type TravelInfoKind =
  | "rideSignUps"
  | "rooms"
  | "hotel"
  | "packingList"
  | "itinerary"

const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-3.5 w-3.5 shrink-0",
  "aria-hidden": true as const,
}

export default function TravelInfoIcon({ kind }: { kind: TravelInfoKind }) {
  switch (kind) {
    case "rideSignUps":
      return (
        <svg {...svgProps}>
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1-2.2-1.3c-.3-.1-.6-.1-.8-.1-2 0-3.8 1.7-3.8 4v4.5" />
          <path d="M14 17H9" />
          <circle cx="6.5" cy="17" r="2.5" />
          <circle cx="16.5" cy="17" r="2.5" />
        </svg>
      )
    case "rooms":
      return (
        <svg {...svgProps}>
          <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
          <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
          <path d="M12 4v6" />
          <path d="M2 20h20" />
        </svg>
      )
    case "hotel":
      return (
        <svg {...svgProps}>
          <path d="M3 21h18" />
          <path d="M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" />
          <path d="M6 11h12" />
          <path d="M10 15h4" />
          <path d="M10 7v4" />
          <path d="M14 7v4" />
        </svg>
      )
    case "packingList":
      return (
        <svg {...svgProps}>
          <path d="M11 18H3" />
          <path d="M15 18H21" />
          <path d="M16 6h2" />
          <path d="M16 10h2" />
          <path d="M16 14h2" />
          <path d="M3 6h.01" />
          <path d="M7 6h.01" />
          <path d="M11 6h.01" />
          <path d="M7 10h.01" />
          <path d="M7 14h.01" />
          <path d="M3 10h.01" />
          <path d="M3 14h.01" />
        </svg>
      )
    case "itinerary":
      return (
        <svg {...svgProps}>
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 14h.01" />
          <path d="M12 14h.01" />
          <path d="M16 14h.01" />
          <path d="M8 18h.01" />
          <path d="M12 18h.01" />
        </svg>
      )
  }
}
