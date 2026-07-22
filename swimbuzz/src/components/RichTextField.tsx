"use client"

import { useRef } from "react"
import {
  prefixRichTextLines,
  wrapRichTextSelection,
} from "@/lib/rich-text-format"

const toolbarBtn =
  "rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground-secondary hover:bg-fill-secondary border-border text-foreground-secondary hover:bg-fill-secondary"

function applyChange(
  textarea: HTMLTextAreaElement,
  next: string,
  selectionStart: number,
  selectionEnd: number,
  onChange: (value: string) => void
) {
  onChange(next)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(selectionStart, selectionEnd)
  })
}

export function RichTextToolbar({
  onMutate,
}: {
  onMutate: (
    fn: (value: string, start: number, end: number) => {
      next: string
      selectionStart: number
      selectionEnd: number
    }
  ) => void
}) {
  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      <button
        type="button"
        className={toolbarBtn}
        onClick={() => onMutate((v, s, e) => wrapRichTextSelection(v, s, e, "**"))}
        title="Bold"
      >
        <span className="font-bold">B</span>
      </button>
      <button
        type="button"
        className={toolbarBtn}
        onClick={() => onMutate((v, s, e) => wrapRichTextSelection(v, s, e, "*"))}
        title="Italic"
      >
        <span className="italic">I</span>
      </button>
      <button
        type="button"
        className={toolbarBtn}
        onClick={() => onMutate((v, s, e) => wrapRichTextSelection(v, s, e, "__"))}
        title="Underline"
      >
        <span className="underline">U</span>
      </button>
      <button
        type="button"
        className={toolbarBtn}
        onClick={() => onMutate((v, s, e) => prefixRichTextLines(v, s, e, "- "))}
        title="Bullet list"
      >
        • List
      </button>
      <button
        type="button"
        className={toolbarBtn}
        onClick={() =>
          onMutate((v, s, e) => wrapRichTextSelection(v, s, e, "[", "](https://)"))
        }
        title="Link"
      >
        Link
      </button>
    </div>
  )
}

export default function RichTextField({
  label,
  icon,
  value,
  onChange,
  rows = 4,
  compact = false,
  mono = false,
  required = false,
  className,
}: {
  label?: string
  icon?: React.ReactNode
  value: string
  onChange: (value: string) => void
  rows?: number
  compact?: boolean
  mono?: boolean
  required?: boolean
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function mutate(
    fn: (value: string, start: number, end: number) => {
      next: string
      selectionStart: number
      selectionEnd: number
    }
  ) {
    const textarea = ref.current
    if (!textarea) return
    const { selectionStart, selectionEnd } = textarea
    const result = fn(value, selectionStart, selectionEnd)
    applyChange(textarea, result.next, result.selectionStart, result.selectionEnd, onChange)
  }

  const textareaClass =
    className ??
    `w-full rounded-lg border px-3 py-2 text-sm bg-background border-border resize-y ${
      compact ? "min-h-[4rem]" : "min-h-[6rem]"
    }${mono ? " font-mono" : ""}`

  return (
    <div>
      {label ? (
        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
          {icon}
          {label}
        </label>
      ) : null}

      <RichTextToolbar onMutate={mutate} />

      <textarea
        ref={ref}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={textareaClass}
      />
    </div>
  )
}
