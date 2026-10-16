"use client"

import { useState } from "react"
import { AppIcon } from "@/components/ui/AppIcon"
import { FilePreviewDialog } from "@/components/ui/FilePreview"
import HoverDetail from "@/components/ui/HoverDetail"
import { toolbarIconButtonClass, useToolbarCondensed } from "@/components/ui/FluidToolbar"

const linkClass = "shrink-0 whitespace-nowrap px-1 text-sm text-primary hover:underline"

/** "View standards" in the Nationals toolbar — an icon button once the toolbar condenses. */
export default function StandardsTableModal({
  yearLabel,
  sourceUrl,
}: {
  yearLabel: string | null
  sourceUrl: string | null
}) {
  const [open, setOpen] = useState(false)
  const condensed = useToolbarCondensed()
  if (!sourceUrl) return null

  const title = `Nationals Time Standards${yearLabel ? ` ${yearLabel}` : ""}`

  return (
    <div className="relative inline-flex shrink-0">
      {/* Width probe: the full link's width, which FluidToolbar measures in
          either mode (see ToolbarSelect). */}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
        <span data-measure className={`inline-block ${linkClass}`}>
          View standards
        </span>
      </div>
      {condensed ? (
        <button type="button" onClick={() => setOpen(true)} aria-label="View standards" className={toolbarIconButtonClass}>
          <AppIcon name="fileText" className="h-4 w-4" />
          <HoverDetail label="View standards" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={linkClass}>
          View standards
        </button>
      )}
      <FilePreviewDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        url={sourceUrl}
        forcePdf
      />
    </div>
  )
}
