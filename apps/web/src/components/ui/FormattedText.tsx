import React from "react"

export const isHtmlEmpty = (html: string | null | undefined) =>
  !html || html.replace(/<[^>]*>?/gm, "").trim() === ""

/** Match the practice page: block tags and breaks become newlines, then pre-wrap. */
export function normalizePracticeHtml(html: string): string {
  return html
    .replace(/<br\b[^>]*class="[^"]*ProseMirror-trailingBreak[^"]*"[^>]*>/gi, "")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:div|p)>/gi, "\n")
    .replace(/<(?:div|p)(?:\s+[^>]*)?>/gi, "")
    .replace(/<(?:\/)?script(?:\s+[^>]*)?>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
}

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
      style={{ whiteSpace: "pre-wrap" }}
      dangerouslySetInnerHTML={{
        __html: normalizePracticeHtml(text),
      }}
    />
  )
}
