"use client"

import {
  Children,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

export function SegmentedToggle({
  selectedIndex,
  children,
  className = "",
  fullWidth = false,
}: {
  selectedIndex: number
  children: ReactNode
  className?: string
  fullWidth?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const items = Children.toArray(children)
  const [visualIndex, setVisualIndex] = useState(selectedIndex)
  const [pill, setPill] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false })
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    setVisualIndex(selectedIndex)
  }, [selectedIndex])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return

    function measure() {
      const node = trackRef.current
      if (!node) return
      const slots = [...node.querySelectorAll<HTMLElement>(":scope > [data-segment]")]
      const slot = slots[visualIndex]
      if (!slot) return
      const control =
        slot.querySelector<HTMLElement>("a, button, [role='tab'], [role='radio']") ??
        slot
      const trackBox = node.getBoundingClientRect()
      const slotBox = control.getBoundingClientRect()
      setPill({
        x: slotBox.left - trackBox.left - node.clientLeft,
        y: slotBox.top - trackBox.top - node.clientTop,
        width: slotBox.width,
        height: slotBox.height,
        ready: true,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    for (const slot of track.querySelectorAll(":scope > [data-segment]")) {
      observer.observe(slot)
    }
    return () => observer.disconnect()
  }, [visualIndex, items.length])

  return (
    <div
      ref={trackRef}
      className={
        (fullWidth ? "flex w-full " : "inline-flex ") +
        "relative p-1 " +
        className
      }
    >
      <div
        aria-hidden
        className={
          "pointer-events-none absolute left-0 top-0 rounded-md bg-primary shadow-sm motion-reduce:transition-none" +
          (animate
            ? " transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            : "")
        }
        style={{
          width: pill.width,
          height: pill.height,
          transform: `translate3d(${pill.x}px,${pill.y}px,0)`,
          opacity: pill.ready ? 1 : 0,
        }}
      />
      {items.map((child, index) => (
        <div
          key={index}
          data-segment
          className={
            fullWidth
              ? "relative z-10 flex min-w-0 flex-1 items-center justify-center"
              : "relative z-10 flex items-center justify-center"
          }
          onPointerDown={() => {
            setAnimate(true)
            setVisualIndex(index)
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

export const segmentedOptionClass = (active: boolean) =>
  "relative z-10 flex h-full w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium leading-none transition-colors duration-200 " +
  (active
    ? "text-primary-text"
    : "text-foreground-secondary hover:text-foreground")

export const segmentedIconOptionClass = (active: boolean) =>
  "relative z-10 flex size-8 items-center justify-center rounded-md leading-none [&_svg]:block transition-colors duration-200 " +
  (active
    ? "text-primary-text"
    : "text-foreground-secondary hover:text-foreground")
