import { ICONS, type IconName, type IconPrimitive } from "@swimbuzz/shared"
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg"

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  color: string
  strokeWidth?: number
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {ICONS[name].map((el, index) => renderPrimitive(el, index, color, strokeWidth))}
    </Svg>
  )
}

function fillFor(el: IconPrimitive, color: string) {
  if ("fill" in el && el.fill === "currentColor") return color
  return "none"
}

function renderPrimitive(
  el: IconPrimitive,
  key: number,
  color: string,
  strokeWidth: number
) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  switch (el.tag) {
    case "path":
      return <Path key={key} d={el.d} fill={fillFor(el, color)} {...stroke} />
    case "circle":
      return (
        <Circle
          key={key}
          cx={el.cx}
          cy={el.cy}
          r={el.r}
          fill={fillFor(el, color)}
          {...stroke}
        />
      )
    case "rect":
      return (
        <Rect
          key={key}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={el.rx}
          ry={el.ry}
          fill="none"
          {...stroke}
        />
      )
    case "polyline":
      return <Polyline key={key} points={el.points} fill="none" {...stroke} />
    case "line":
      return (
        <Line
          key={key}
          x1={el.x1}
          y1={el.y1}
          x2={el.x2}
          y2={el.y2}
          {...stroke}
        />
      )
  }
}
