"use client"

import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
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
  "6xl": "max-w-6xl",
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
      className={`shrink-0 flex flex-wrap gap-2 border-t border-border px-4 py-3 dark:border-border sm:gap-3 sm:px-6 sm:py-4 ${className}`}
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
  top,
  children,
  footer,
  maxWidth = "lg",
  portal = true,
  onSubmit,
  panelClassName = "",
  bodyClassName = "",
  overlayClassName = "",
  presentation = "dialog",
  busy = false,
}: {
  open: boolean
  onClose: () => void
  closeDisabled?: boolean
  title?: ReactNode
  description?: ReactNode
  header?: ReactNode
  /** Full-bleed content above the header and body (e.g. a banner). */
  top?: ReactNode
  children?: ReactNode
  footer: ReactNode
  maxWidth?: ModalMaxWidth
  portal?: boolean
  onSubmit?: (e: FormEvent) => void
  panelClassName?: string
  bodyClassName?: string
  overlayClassName?: string
  /** Render the form surface inline on a route instead of as an overlay. */
  presentation?: "dialog" | "inline"
  /** Long save/scrape in progress — show a don't-reload notice. */
  busy?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useDontReloadWhileBusy(open && busy)

  useEffect(() => {
    if (!open || presentation === "inline") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, presentation])

  if (!open || (presentation !== "inline" && portal && !mounted)) return null

  const hasBody = children != null && children !== false

  const body = hasBody ? (
    <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4 sm:px-6 sm:py-4 ${bodyClassName}`}>
      {children}
    </div>
  ) : null

  const panel = (
    <div
      className={`relative z-10 flex w-full ${MAX_WIDTH[maxWidth]} max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl sm:max-h-[90vh] ${panelClassName}`}
      onClick={(e) => e.stopPropagation()}
    >
      {top}
      {(title || description || header) && (
        <div className={`shrink-0 px-4 pt-4 sm:px-6 sm:pt-6 ${hasBody ? "pb-2" : "pb-4"}`}>
          {title ? (
            <h2 className="text-lg font-medium text-foreground">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm text-foreground-secondary">{description}</p>
          ) : null}
          {header}
        </div>
      )}

      {onSubmit ? (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          {body}
          {footer}
        </form>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {body}
          {footer}
        </div>
      )}
    </div>
  )

  const overlay = (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 ${overlayClassName}`}
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

  if (presentation === "inline") return panel
  if (portal) return createPortal(overlay, document.body)
  return overlay
}
