"use client"

import { useState } from "react"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import type { PublishAllPlan } from "./publish-all"

/** Publishes every unpublished relay event (drafts and optimal suggestions) after a confirm. */
export default function PublishAllRelaysButton({
  plan,
  busy,
  onPublish,
}: {
  plan: PublishAllPlan
  /** A save is still in flight. */
  busy: boolean
  onPublish: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const count = plan.ready.length

  return (
    <>
      <button
        type="button"
        aria-label="Publish all"
        onClick={() => setConfirming(true)}
        disabled={count === 0 || busy}
        className="group relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-contrast transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary"
      >
        <ActionIcon kind="publish" className="h-4 w-4" />
        <HoverDetail label="Publish all" />
      </button>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Publish ${count} relay ${count === 1 ? "event" : "events"}?`}
        description="Athletes will see them on the Relays page."
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false)
                onPublish()
              }}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              Publish
            </button>
          </ModalFooter>
        }
      >
        {plan.skipped.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">Skipped</p>
            <ul className="flex flex-col gap-0.5 text-sm text-foreground-secondary">
              {plan.skipped.map((s) => (
                <li key={s.label}>
                  {s.label}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
