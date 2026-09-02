import sanitizeHtml from "sanitize-html"

/** Tags/attrs the TipTap editor can actually produce, matching what web's
 * FormattedText and mobile's hand-rolled HTML parser both know how to render. */
const ALLOWED_TAGS = [
  "p",
  "div",
  "br",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "pre",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "code",
  "a",
]

/** Sanitizes user-authored TipTap HTML (practice sets/focus) before it is
 * persisted, so stored content can never carry scripts or event handlers. */
export function sanitizePracticeHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  }).trim()
}
