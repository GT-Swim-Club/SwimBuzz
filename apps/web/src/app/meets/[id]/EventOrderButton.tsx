"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { EventOrder } from "@/lib/meet/meet-event-order"
import MeetResourceIcon from "@/components/meet/MeetResourceIcon"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import EventOrderTable, { eventOrderColumns } from "./EventOrderTable"

const buttonClass =
  "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"

const MAX_WIDTH_BY_COLUMNS = { 1: "md", 2: "3xl", 3: "5xl", 4: "6xl" } as const

// Below this the text gets too small to read, so the modal body scrolls instead.
const MIN_SCALE = 0.5

/**
 * Shrinks its content to fit the modal body's available height so the whole order of events
 * shows without scrolling. Must be the modal body's only child.
 */
function FitToHeight({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  // null = render at natural size so the (then max-height) modal body can be measured.
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null)

  useLayoutEffect(() => {
    if (fit) return
    const inner = innerRef.current
    const body = outerRef.current?.parentElement
    if (!inner || !body) return
    const style = getComputedStyle(body)
    const available =
      body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    const natural = inner.offsetHeight
    const scale = natural > available ? Math.max(MIN_SCALE, available / natural) : 1
    setFit({ scale, height: natural * scale })
  }, [fit])

  useEffect(() => {
    const remeasure = () => setFit(null)
    window.addEventListener("resize", remeasure)
    return () => window.removeEventListener("resize", remeasure)
  }, [])

  const scaled = fit && fit.scale < 1
  return (
    <div ref={outerRef} style={scaled ? { height: fit.height } : undefined}>
      <div
        ref={innerRef}
        style={scaled ? { transform: `scale(${fit.scale})`, transformOrigin: "top center" } : undefined}
      >
        {children}
      </div>
    </div>
  )
}

export default function EventOrderButton({
  order,
  trigger,
}: {
  order: EventOrder
  /** Custom trigger; receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)

  if (!order.sessions.length) return null

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
          <MeetResourceIcon kind="eventOrder" />
          Order of Events
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={<span className="block text-center">Order of Events</span>}
        maxWidth={MAX_WIDTH_BY_COLUMNS[eventOrderColumns(order)]}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
            >
              Close
            </button>
          </ModalFooter>
        }
      >
        <FitToHeight>
          <EventOrderTable order={order} />
        </FitToHeight>
      </Modal>
    </>
  )
}
