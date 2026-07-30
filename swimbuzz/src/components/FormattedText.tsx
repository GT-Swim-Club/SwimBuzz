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
      className={`prose prose-sm max-w-none text-foreground prose-a:text-[var(--brand-color-primary)] prose-a:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${mono ? "font-mono" : ""} ${className}`}
      style={{ whiteSpace: 'pre-wrap' }}
      dangerouslySetInnerHTML={{ __html: text.replace(/<(?:\/)?(?:div|p|script)(?:\s+[^>]*)?>/g, "") }}
    />
  )
}
