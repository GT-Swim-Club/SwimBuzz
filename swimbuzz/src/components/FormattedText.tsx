import React from "react"
import { parseRichTextBlocks } from "@/lib/rich-text-format"

export function FormattedText({
  text,
  className = "",
  mono = false,
}: {
  text: string
  className?: string
  mono?: boolean
}) {
  return (
    <div
      className={`space-y-1 text-sm text-foreground${mono ? " font-mono" : ""} ${className}`}
    >
      {parseRichTextBlocks(text)}
    </div>
  )
}
