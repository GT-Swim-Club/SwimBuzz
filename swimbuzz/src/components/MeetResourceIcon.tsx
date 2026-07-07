export type MeetResourceKind =
  | "packet"
  | "eventOrder"
  | "entries"
  | "psych"
  | "heat"
  | "results"
  | "liveStream"

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

export default function MeetResourceIcon({ kind }: { kind: MeetResourceKind }) {
  switch (kind) {
    case "packet":
      return (
        <svg {...svgProps}>
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </svg>
      )
    case "eventOrder":
      return (
        <svg {...svgProps}>
          <path d="M10 12h11" />
          <path d="M10 18h11" />
          <path d="M10 6h11" />
          <path d="M4 10h2" />
          <path d="M4 6h1v4" />
          <path d="M4 18h2" />
          <path d="M4 14h1v4" />
        </svg>
      )
    case "entries":
      return (
        <svg {...svgProps}>
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M12 11h4" />
          <path d="M12 16h4" />
          <path d="M8 11h.01" />
          <path d="M8 16h.01" />
        </svg>
      )
    case "psych":
      return (
        <svg {...svgProps}>
          <path d="M3 3v18h18" />
          <path d="M7 16l4-8 4 5 4-9" />
        </svg>
      )
    case "heat":
      return (
        <svg {...svgProps}>
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      )
    case "results":
      return (
        <svg {...svgProps}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      )
    case "liveStream":
      return (
        <svg {...svgProps}>
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      )
  }
}
