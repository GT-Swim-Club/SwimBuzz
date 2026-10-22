"use client"

import { useState } from "react"
import HoverDetail from "@/components/ui/HoverDetail"
import {
  addSwimCloudIds,
  MAX_SWIMCLOUD_IDS,
  normalizeSwimCloudIdInput,
  parseSwimCloudProfileList,
  SWIMCLOUD_ID_ERROR,
  SWIMCLOUD_IDS_LIMIT_ERROR,
} from "@/lib/swim/swimcloud-id"

/**
 * State for SwimCloudIdsInput. `allIds` also counts a valid ID still sitting in
 * the text box, so submitting without pressing Enter first keeps it.
 */
export function useSwimCloudIdsField(initial: number[] = []) {
  const [ids, setIds] = useState(initial)
  const [draft, setDraft] = useState("")
  const parsedDraft = parseSwimCloudProfileList(draft)
  const allIds = [...new Set([...ids, ...parsedDraft.ids])]
  const draftInvalid = parsedDraft.invalid.length > 0
  const overLimit = allIds.length > MAX_SWIMCLOUD_IDS

  return {
    ids,
    setIds,
    draft,
    setDraft,
    allIds,
    draftInvalid,
    overLimit,
    valid: !draftInvalid && !overLimit,
    reset(next: number[] = []) {
      setIds(next)
      setDraft("")
    },
  }
}

export type SwimCloudIdsField = ReturnType<typeof useSwimCloudIdsField>

const SEPARATOR = /[\s,;]/

/**
 * One text box for up to MAX_SWIMCLOUD_IDS SwimCloud IDs or profile links. Enter,
 * comma, space, or + turns the text into a removable chip; pasting several at once
 * adds them all.
 */
export default function SwimCloudIdsInput({
  field,
  id,
}: {
  field: SwimCloudIdsField
  /** Prefix for the input and hint ids. */
  id: string
}) {
  const { ids, setIds, draft, setDraft, draftInvalid, overLimit } = field
  // Keep the box while it still holds text, so an ID past the limit can be fixed.
  const showInput = ids.length < MAX_SWIMCLOUD_IDS || draft !== ""
  const hintId = `${id}-hint`

  /** Move every valid ID in `text` into chips; `typing` is a piece still being typed. */
  function commit(text: string, typing = "") {
    const next = addSwimCloudIds(ids, text)
    setIds(next.ids)
    setDraft([next.leftover, typing].filter(Boolean).join(" "))
  }

  function handleChange(value: string) {
    if (!SEPARATOR.test(value)) {
      setDraft(normalizeSwimCloudIdInput(value))
      return
    }
    const pieces = value.split(SEPARATOR)
    const typing = SEPARATOR.test(value.slice(-1)) ? "" : (pieces.pop() ?? "")
    commit(pieces.join(" "), normalizeSwimCloudIdInput(typing))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && draft.trim()) {
      e.preventDefault()
      commit(draft)
    } else if (e.key === "Backspace" && draft === "" && ids.length > 0) {
      setIds(ids.slice(0, -1))
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border border-border-secondary bg-background px-2 py-1.5 focus-within:border-primary">
        {ids.map((swimCloudId) => (
          <span
            key={swimCloudId}
            className="inline-flex items-center gap-1 rounded-md bg-fill-secondary py-0.5 pl-2 pr-1 text-sm tabular-nums text-foreground"
          >
            {swimCloudId}
            <button
              type="button"
              onClick={() => setIds(ids.filter((entry) => entry !== swimCloudId))}
              aria-label={`Remove SwimCloud ID ${swimCloudId}`}
              className="group relative inline-flex h-5 w-5 items-center justify-center rounded text-foreground-secondary hover:bg-background-hover hover:text-foreground"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="h-3 w-3" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
              <HoverDetail label={`Remove SwimCloud ID ${swimCloudId}`} />
            </button>
          </span>
        ))}
        {showInput && (
          <>
            <input
              id={id}
              type="text"
              inputMode="numeric"
              aria-label="SwimCloud ID or URL"
              placeholder={ids.length === 0 ? "Paste a SwimCloud profile link or ID" : "Add another"}
              title={SWIMCLOUD_ID_ERROR}
              value={draft}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => draft.trim() && commit(draft)}
              className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
              aria-invalid={draftInvalid || overLimit}
              aria-describedby={draftInvalid || overLimit ? hintId : undefined}
            />
            {draft.trim() !== "" && !draftInvalid && (
              <button
                type="button"
                onClick={() => commit(draft)}
                aria-label="Add SwimCloud ID"
                className="group relative inline-flex h-6 w-6 items-center justify-center rounded text-foreground-secondary hover:bg-background-hover hover:text-primary"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <HoverDetail label="Add SwimCloud ID" />
              </button>
            )}
          </>
        )}
      </div>
      {(draftInvalid || overLimit) && (
        <p id={hintId} className="text-xs text-info">
          {draftInvalid ? SWIMCLOUD_ID_ERROR : SWIMCLOUD_IDS_LIMIT_ERROR}
        </p>
      )}
    </div>
  )
}
