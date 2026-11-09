import type { jsPDF } from "jspdf"
import { ICONS, type IconName, type IconPrimitive } from "@swimbuzz/shared"

type RGB = [number, number, number]
type Point = [number, number]
type PathOp = { op: "m" | "l" | "c" | "h"; c: number[] }

/**
 * One of the shared app icons (Lucide's 24×24 strokes) drawn as vector strokes into a `size` box
 * at `x`, `top` — the same icon web and mobile render, at the same 2/24 stroke weight.
 */
export function drawPdfIcon(doc: jsPDF, name: IconName, x: number, top: number, size: number, color: RGB) {
  const u = size / 24
  const at = ([px, py]: Point): Point => [x + px * u, top + py * u]
  doc.setDrawColor(...color)
  doc.setLineWidth(2 * u)
  doc.setLineCap("round")
  doc.setLineJoin("round")
  for (const el of ICONS[name] as readonly IconPrimitive[]) {
    switch (el.tag) {
      case "path": {
        const ops = pathOps(el.d).map(({ op, c }) => {
          const points: number[] = []
          for (let i = 0; i < c.length; i += 2) points.push(...at([c[i], c[i + 1]]))
          return { op, c: points }
        })
        doc.path(ops)
        if (el.fill === "currentColor") {
          doc.setFillColor(...color)
          doc.fillStroke()
        } else {
          doc.stroke()
        }
        break
      }
      case "circle":
        if (el.fill === "currentColor") doc.setFillColor(...color)
        doc.circle(...at([el.cx, el.cy]), el.r * u, el.fill === "currentColor" ? "FD" : "S")
        break
      case "rect": {
        const rx = (el.rx ?? el.ry ?? 0) * u
        const ry = (el.ry ?? el.rx ?? 0) * u
        doc.roundedRect(...at([el.x, el.y]), el.width * u, el.height * u, rx, ry, "S")
        break
      }
      case "polyline": {
        const nums = el.points.trim().split(/[\s,]+/).map(Number)
        const ops: PathOp[] = []
        for (let i = 0; i < nums.length; i += 2) ops.push({ op: i === 0 ? "m" : "l", c: at([nums[i], nums[i + 1]]) })
        doc.path(ops)
        doc.stroke()
        break
      }
      case "line":
        doc.line(...at([el.x1, el.y1]), ...at([el.x2, el.y2]))
        break
    }
  }
  doc.setLineCap("butt")
  doc.setLineJoin("miter")
}

/**
 * An SVG path's `d` as jsPDF path ops in the icon's own units: moves, lines and cubic curves, with
 * H/V, S and arcs (as cubics) resolved — every command the shared icons use.
 */
function pathOps(d: string): PathOp[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
  const ops: PathOp[] = []
  let i = 0
  let command = ""
  let current: Point = [0, 0]
  let start: Point = [0, 0]
  // The last curve's second control point, reflected for S.
  let lastControl: Point | null = null
  const num = () => Number(tokens[i++])
  // Arc flags can run together with what follows ("0 011 2" → 0, 0, 1, 1 2); take one digit each.
  const flag = () => {
    const token = tokens[i]
    if (token.length > 1) {
      tokens[i] = token.slice(1)
      return token[0] === "1"
    }
    i++
    return token === "1"
  }

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++]
    const relative = command === command.toLowerCase()
    const base: Point = relative ? current : [0, 0]
    const point = (): Point => {
      const px = num()
      const py = num()
      return [base[0] + px, base[1] + py]
    }
    switch (command.toLowerCase()) {
      case "m": {
        current = start = point()
        ops.push({ op: "m", c: current })
        // Coordinates after a move's first pair are lines.
        command = relative ? "l" : "L"
        lastControl = null
        break
      }
      case "l":
        current = point()
        ops.push({ op: "l", c: current })
        lastControl = null
        break
      case "h":
        current = [(relative ? current[0] : 0) + num(), current[1]]
        ops.push({ op: "l", c: current })
        lastControl = null
        break
      case "v":
        current = [current[0], (relative ? current[1] : 0) + num()]
        ops.push({ op: "l", c: current })
        lastControl = null
        break
      case "c": {
        const c1 = point()
        const c2 = point()
        const end = point()
        ops.push({ op: "c", c: [...c1, ...c2, ...end] })
        lastControl = c2
        current = end
        break
      }
      case "s": {
        const c1: Point = lastControl ? [2 * current[0] - lastControl[0], 2 * current[1] - lastControl[1]] : current
        const c2 = point()
        const end = point()
        ops.push({ op: "c", c: [...c1, ...c2, ...end] })
        lastControl = c2
        current = end
        break
      }
      case "a": {
        const rx = num()
        const ry = num()
        const rotation = num()
        const large = flag()
        const sweep = flag()
        const end = point()
        for (const curve of arcToCubics(current, end, rx, ry, rotation, large, sweep)) {
          ops.push({ op: "c", c: curve })
        }
        current = end
        lastControl = null
        break
      }
      case "z":
        ops.push({ op: "h", c: [] })
        current = start
        lastControl = null
        break
      default:
        // An unknown command: skip its token rather than loop.
        i++
    }
  }
  return ops
}

/** An SVG elliptical arc as cubic Béziers of at most a quarter turn each (SVG spec F.6). */
function arcToCubics(
  from: Point,
  to: Point,
  rx: number,
  ry: number,
  rotationDeg: number,
  large: boolean,
  sweep: boolean
): number[][] {
  if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1])) return [[...from, ...to, ...to]]
  const phi = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from[0] - to[0]) / 2
  const dy = (from[1] - to[1]) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  // Radii too small to reach the end grow just enough.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const sign = large === sweep ? -1 : 1
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const coef = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * y1 * y1 + ry * ry * x1 * x1)))
  const cxp = (coef * rx * y1) / ry
  const cyp = (-coef * ry * x1) / rx
  const cx = cos * cxp - sin * cyp + (from[0] + to[0]) / 2
  const cy = sin * cxp + cos * cyp + (from[1] + to[1]) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
  let delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI

  const segments = Math.ceil(Math.abs(delta) / (Math.PI / 2))
  const step = delta / segments
  const k = (4 / 3) * Math.tan(step / 4)
  const onEllipse = (t: number): Point => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ]
  const derivative = (t: number): Point => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ]
  const curves: number[][] = []
  for (let s = 0; s < segments; s++) {
    const t1 = theta1 + s * step
    const t2 = t1 + step
    const p1 = onEllipse(t1)
    const p2 = onEllipse(t2)
    const d1 = derivative(t1)
    const d2 = derivative(t2)
    curves.push([p1[0] + k * d1[0], p1[1] + k * d1[1], p2[0] - k * d2[0], p2[1] - k * d2[1], ...p2])
  }
  return curves
}
