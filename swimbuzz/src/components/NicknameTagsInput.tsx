"use client"

import { useState } from "react"

type NicknameTagsInputProps = {
  value: string[]
  onChange: (nicknames: string[]) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Show an Add button next to the input (default false). */
  showAddButton?: boolean
}

export default function NicknameTagsInput({
  value,
  onChange,
  placeholder = "Add name + Enter",
  disabled = false,
  id,
  showAddButton = false,
}: NicknameTagsInputProps) {
  const [draft, setDraft] = useState("")

  function addNickname(raw: string) {
    const name = raw.trim()
    if (!name) return
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
              className="text-xs px-2 py-0.5 rounded-full border bg-indigo-600 border-indigo-600 text-white disabled:opacity-40"
            >
              {name} ✕
            </button>
          ))}
        </div>
      )}
      <div className={showAddButton ? "flex flex-wrap items-center gap-3" : undefined}>
        <input
          id={id}
          type="text"
          disabled={disabled}
          placeholder={placeholder}
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
            "rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700 disabled:opacity-40 " +
            (showAddButton ? "flex-1 min-w-[160px]" : "w-full")
          }
        />
        {showAddButton && (
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={() => addNickname(draft)}
            className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        )}
      </div>
    </div>
  )
}
