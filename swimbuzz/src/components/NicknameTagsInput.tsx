"use client"

import { useState, type ReactNode } from "react"
import { MAX_NICKNAMES } from "@/lib/athlete-match"

type NicknameTagsInputProps = {
  value: string[]
  onChange: (nicknames: string[]) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Show an Add button next to the input (default false). */
  showAddButton?: boolean
  /** Extra controls rendered after the Add button (e.g. Request). */
  actions?: ReactNode
}

export default function NicknameTagsInput({
  value,
  onChange,
  placeholder = "Add name + Enter",
  disabled = false,
  id,
  showAddButton = false,
  actions,
}: NicknameTagsInputProps) {
  const [draft, setDraft] = useState("")
  const atLimit = value.length >= MAX_NICKNAMES

  function addNickname(raw: string) {
    const name = raw.trim()
    if (!name || atLimit) return
    if (value.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setDraft("")
      return
    }
    onChange([...value, name])
    setDraft("")
  }

  function removeNickname(name: string) {
    onChange(value.filter((n) => n !== name))
  }

  const showRow = showAddButton || actions != null

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => removeNickname(name)}
              className="text-xs px-2 py-0.5 rounded-full border border-border-secondary bg-primary border-indigo-600 text-primary-text disabled:opacity-40"
            >
              {name} ✕
            </button>
          ))}
        </div>
      )}
      <div className={showRow ? "flex flex-wrap items-center gap-3" : undefined}>
        <input
          id={id}
          type="text"
          disabled={disabled || atLimit}
          placeholder={atLimit ? `Maximum of ${MAX_NICKNAMES} nicknames` : placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addNickname(draft)
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              removeNickname(value[value.length - 1])
            }
          }}
          className={
            "rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary disabled:opacity-40 " +
            (showRow ? "flex-1 min-w-[160px]" : "w-full")
          }
        />
        {showAddButton && (
          <button
            type="button"
            disabled={disabled || atLimit || !draft.trim()}
            onClick={() => addNickname(draft)}
            className="text-sm px-4 py-2 border border-border-secondary rounded-lg hover:bg-fill-secondary hover:bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        )}
        {actions}
      </div>
    </div>
  )
}
