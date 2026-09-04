import { ICONS, type IconName, type IconPrimitive } from "@swimbuzz/shared"

export function AppIcon({
  name,
  className,
  strokeWidth = 2,
}: {
  name: IconName
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {ICONS[name].map((el, index) => renderPrimitive(el, index))}
    </svg>
  )
}

function renderPrimitive(el: IconPrimitive, key: number) {
  switch (el.tag) {
    case "path":
      return <path key={key} d={el.d} fill={el.fill ?? "none"} />
    case "circle":
      return (
        <circle
          key={key}
          cx={el.cx}
          cy={el.cy}
          r={el.r}
          fill={el.fill ?? "none"}
        />
      )
    case "rect":
      return (
        <rect
          key={key}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={el.rx}
          ry={el.ry}
        />
      )
    case "polyline":
      return <polyline key={key} points={el.points} />
    case "line":
      return <line key={key} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />
  }
}
