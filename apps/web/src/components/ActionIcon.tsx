export type ActionKind = "edit" | "reply" | "check" | "close" | "publish" | "delete" | "export" | "share" | "pdf" | "image" | "attendance" | "scan" | "record"

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

export default function ActionIcon({ kind, className }: { kind: ActionKind, className?: string }) {
  switch (kind) {
    case "edit":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      )
    case "reply":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M9 17 4 12l5-5" />
          <path d="M4 12h9a7 7 0 0 1 7 7" />
        </svg>
      )
    case "check":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      )
    case "close":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </svg>
      )
    case "publish":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M12 19V5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      )
    case "delete":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      )
    case "export":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )
    case "share":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M5 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
          <polyline points="7 8 12 3 17 8" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )
    case "pdf":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M10 13h1v6h-1" />
          <path d="M9 19h2" />
          <path d="M14 13h1.5a1.5 1.5 0 0 1 0 3H14v3" />
        </svg>
      )
    case "attendance":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect width="8" height="4" x="8" y="2" rx="1" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      )
    case "scan":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M3 12h18" />
        </svg>
      )
    case "image":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      )
    case "record":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
  }
}
