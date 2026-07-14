"use client"

import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import DontReloadNotice from "@/components/DontReloadNotice"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"

const MAX_WIDTH = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
} as const

type ModalMaxWidth = keyof typeof MAX_WIDTH

export function ModalFooter({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`shrink-0 flex gap-3 border-t border-gray-200 px-6 py-4 dark:border-zinc-700 ${className}`}
    >
      {children}
    </div>
  )
}

export default function Modal({
  open,
  onClose,
  closeDisabled = false,
  title,
  description,
  header,
  children,
  footer,
  maxWidth = "lg",
  portal = true,
  onSubmit,
  panelClassName = "",
  bodyClassName = "",
  overlayClassName = "",
  busy = false,
}: {
  open: boolean
  onClose: () => void
  closeDisabled?: boolean
  title?: ReactNode
  description?: ReactNode
  header?: ReactNode
  children?: ReactNode
  footer: ReactNode
  maxWidth?: ModalMaxWidth
  portal?: boolean
  onSubmit?: (e: FormEvent) => void
  panelClassName?: string
  bodyClassName?: string
  overlayClassName?: string
  /** Long save/scrape in progress — show a don't-reload notice. */
  busy?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useDontReloadWhileBusy(open && busy)

  if (!open || (portal && !mounted)) return null

  const hasBody = children != null && children !== false

  const body = hasBody ? (
    <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4 ${bodyClassName}`}>
      {children}
    </div>
  ) : null

  const busyNotice = busy ? (
    <div className="shrink-0 px-6 pb-1">
      <DontReloadNotice />
    </div>
  ) : null

  const panel = (
    <div
      className={`relative z-10 flex w-full ${MAX_WIDTH[maxWidth]} max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 ${panelClassName}`}
      onClick={(e) => e.stopPropagation()}
    >
      {(title || description || header) && (
        <div className={`shrink-0 px-6 pt-6 ${hasBody ? "pb-2" : "pb-4"}`}>
          {title ? (
            <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">{description}</p>
          ) : null}
          {header}
        </div>
      )}

      {onSubmit ? (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          {body}
          {busyNotice}
          {footer}
        </form>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {body}
          {busyNotice}
          {footer}
        </div>
      )}
    </div>
  )

  const overlay = (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClassName}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !closeDisabled && onClose()}
        aria-label="Close dialog"
      />
      {panel}
    </div>
  )

  if (portal) return createPortal(overlay, document.body)
  return overlay
}
