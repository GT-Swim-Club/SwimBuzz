"use client"

import { useState } from "react"
import { FilePreviewDialog } from "@/components/FilePreview"

export default function StandardsTableModal({
  yearLabel,
  sourceUrl,
}: {
  yearLabel: string | null
  sourceUrl: string | null
}) {
  const [open, setOpen] = useState(false)
  if (!sourceUrl) return null

  const title = `Nationals Time Standards${yearLabel ? ` ${yearLabel}` : ""}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary hover:underline dark:text-primary"
      >
        View standards
      </button>
      <FilePreviewDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        url={sourceUrl}
        forcePdf
      />
    </>
  )
}
