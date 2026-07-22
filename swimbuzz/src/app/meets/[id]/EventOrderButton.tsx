"use client"

import { useState } from "react"
import type { EventOrder } from "@/lib/meet-event-order"
import MeetResourceIcon from "@/components/MeetResourceIcon"
import Modal, { ModalFooter } from "@/components/Modal"
import EventOrderTable from "./EventOrderTable"

const buttonClass =
  "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary bg-background transition-colors"

export default function EventOrderButton({ order }: { order: EventOrder }) {
  const [open, setOpen] = useState(false)

  if (!order.sessions.length) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <MeetResourceIcon kind="eventOrder" />
        Order of Events
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Order of Events"
        maxWidth="2xl"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border"
            >
              Close
            </button>
          </ModalFooter>
        }
      >
        <EventOrderTable order={order} />
      </Modal>
    </>
  )
}
