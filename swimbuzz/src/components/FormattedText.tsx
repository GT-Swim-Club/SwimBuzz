import React from "react"

export const isHtmlEmpty = (html: string | null | undefined) =>
  !html || html.replace(/<[^>]*>?/gm, "").trim() === ""

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
      className={`prose prose-sm max-w-none text-foreground prose-a:text-[var(--brand-color-primary)] prose-a:underline ${mono ? "font-mono" : ""} ${className}`}
      style={{ whiteSpace: 'pre-wrap' }}
      dangerouslySetInnerHTML={{ __html: text.replace(/<(?:\/)?(?:div|p)(?:\s+[^>]*)?>/g, "") }}
    />
  )
}
