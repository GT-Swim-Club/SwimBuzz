"use client"

import { useState } from "react"
import TravelInfoIcon, { type TravelInfoKind } from "@/components/TravelInfoIcon"
import { FormattedText } from "@/components/FormattedText"
import Modal, { ModalFooter } from "@/components/Modal"

const buttonClass =
  "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"

type TravelLinkItem = {
  type: "link"
  label: string
  icon: TravelInfoKind
  href: string
}

type TravelTextItem = {
  type: "text"
  label: string
  icon: TravelInfoKind
  content: string
}

export type TravelInfoItem = TravelLinkItem | TravelTextItem

export default function TravelInfoButtons({ items }: { items: TravelInfoItem[] }) {
  const [openText, setOpenText] = useState<TravelTextItem | null>(null)

  if (items.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {items.map((item) =>
          item.type === "link" ? (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass}
            >
              <TravelInfoIcon kind={item.icon} />
              {item.label}
            </a>
          ) : (
            <button
              key={item.label}
              type="button"
              onClick={() => setOpenText(item)}
              className={buttonClass}
            >
              <TravelInfoIcon kind={item.icon} />
              {item.label}
            </button>
          )
        )}
      </div>

      <Modal
        open={openText !== null}
        onClose={() => setOpenText(null)}
        title={openText?.label}
        maxWidth={openText?.icon === "itinerary" ? "lg" : "md"}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpenText(null)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
            >
              Close
            </button>
          </ModalFooter>
        }
      >
        {openText ? <FormattedText text={openText.content} /> : null}
      </Modal>
    </>
  )
}
