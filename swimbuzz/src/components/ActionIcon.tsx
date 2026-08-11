export type ActionKind = "edit" | "delete"

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
    case "delete":
      return (
        <svg {...svgProps} className={`${svgProps.className} ${className ?? ""}`}>
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      )
  }
}
