import React from "react"

export function wrapRichTextSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string = before
) {
  const selected = value.slice(start, end)
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  const cursor =
    selected.length > 0
      ? start + before.length + selected.length + after.length
      : start + before.length
  return { next, selectionStart: cursor, selectionEnd: cursor }
}

export function prefixRichTextLines(
  value: string,
  start: number,
  end: number,
  prefix: string
) {
  const blockStart = value.lastIndexOf("\n", start - 1) + 1
  const blockEnd = value.indexOf("\n", end)
  const sliceEnd = blockEnd === -1 ? value.length : blockEnd
  const block = value.slice(blockStart, sliceEnd)
  const lines = block.split("\n")
  const nextBlock = lines
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join("\n")
  const next = value.slice(0, blockStart) + nextBlock + value.slice(sliceEnd)
  return { next, selectionStart: blockStart, selectionEnd: blockStart + nextBlock.length }
}

const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g

function renderInlineSegment(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  const pattern = new RegExp(INLINE_PATTERN.source, INLINE_PATTERN.flags)

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }

    const token = match[0]
    if (token.startsWith("**")) {
      parts.push(
        React.createElement("strong", { key: `${match.index}-b` }, token.slice(2, -2))
      )
    } else if (token.startsWith("__")) {
      parts.push(
        React.createElement("span", { key: `${match.index}-u`, className: "underline" }, token.slice(2, -2))
      )
    } else if (token.startsWith("*")) {
      parts.push(
        React.createElement("em", { key: `${match.index}-i` }, token.slice(1, -1))
      )
    } else if (token.startsWith("[")) {
      const labelEnd = token.indexOf("](")
      const label = token.slice(1, labelEnd)
      const url = token.slice(labelEnd + 2, -1)
      if (/^https?:\/\//i.test(url)) {
        parts.push(
          React.createElement(
            "a",
            {
              key: `${match.index}-a`,
              href: url,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "text-indigo-600 hover:underline dark:text-indigo-400",
            },
            label
          )
        )
      } else {
        parts.push(token)
      }
    }

    last = match.index + token.length
  }

  if (last < text.length) parts.push(text.slice(last))
  return parts.length > 0 ? parts : [text]
}

export function parseRichTextBlocks(text: string): React.ReactNode[] {
  const lines = text.split("\n")
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  function flushList() {
    if (listItems.length === 0) return
    blocks.push(
      React.createElement(
        "ul",
        { key: `ul-${key++}`, className: "list-disc pl-5 space-y-1" },
        listItems.map((item, i) =>
          React.createElement("li", { key: i }, ...renderInlineSegment(item))
        )
      )
    )
    listItems = []
  }

  for (const line of lines) {
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      listItems.push(bullet[1])
      continue
    }

    flushList()

    if (!line.trim()) {
      blocks.push(React.createElement("div", { key: `sp-${key++}`, className: "h-2" }))
      continue
    }

    blocks.push(
      React.createElement(
        "p",
        { key: `p-${key++}`, className: "whitespace-pre-wrap" },
        ...renderInlineSegment(line)
      )
    )
  }

  flushList()
  return blocks
}
