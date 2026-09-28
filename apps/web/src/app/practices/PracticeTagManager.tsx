"use client"

import { type AnimationEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { PRACTICE_TAG_MAX_COUNT, PRACTICE_TAG_NAME_MAX_LENGTH } from "@/lib/practice/practice-tags"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { createPracticeTag, deletePracticeTag } from "./PracticeTagManager.actions"

type PracticeTag = { id: string; name: string }

const controlClass =
  "group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-secondary bg-background text-foreground transition-colors hover:bg-fill-secondary"

// Marks the portal-rendered dropdown so the outside-click handler below doesn't treat a click
// inside it as "outside" — it lives outside `popoverRef`'s DOM subtree once portalled.
const FLYOUT_SCOPE_ATTR = "data-practice-tag-manager-flyout"
const VIEWPORT_PADDING = 8

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.828 8.828a2 2 0 0 0 2.828 0l7.172-7.172a2 2 0 0 0 0-2.828z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  )
}

export default function PracticeTagManager({
  initialTags,
  isCoach,
  activeTags,
  onTagsChange,
}: {
  initialTags: PracticeTag[]
  isCoach: boolean
  activeTags: string[]
  onTagsChange: (tags: string[]) => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const draftInputRef = useRef<HTMLInputElement>(null)
  const closingDraftRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [tags, setTags] = useState(initialTags)
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [draftMounted, setDraftMounted] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const saving = isPending
  const [pendingRemoval, setPendingRemoval] = useState<PracticeTag | null>(null)

  // Rendered in a portal below (not CSS position:absolute) so the practices sidebar's
  // overflow-hidden scroll container can't clip a dropdown that extends past its edge —
  // same fix as HoverDetail.tsx / the settings dropdown's Sort submenu. Position is computed
  // from the trigger's viewport rect, flipping above when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return
    function updatePosition() {
      const trigger = popoverRef.current
      const panel = panelRef.current
      if (!trigger) return

      const triggerRect = trigger.getBoundingClientRect()
      const panelWidth = panel?.offsetWidth ?? 200
      const panelHeight = panel?.offsetHeight ?? 0
      const gap = 6

      const fitsBelow = triggerRect.bottom + gap + panelHeight <= window.innerHeight - VIEWPORT_PADDING
      const top = fitsBelow
        ? triggerRect.bottom + gap
        : Math.max(VIEWPORT_PADDING, triggerRect.top - gap - panelHeight)
      const left = Math.max(
        VIEWPORT_PADDING,
        Math.min(triggerRect.right - panelWidth, window.innerWidth - VIEWPORT_PADDING - panelWidth)
      )

      setPosition({ top, left })
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open, adding, draftMounted, tags.length])

  useEffect(() => {
    // The removal dialog is portaled outside the dropdown; its clicks should
    // not dismiss the dropdown underneath it.
    if (!open || pendingRemoval !== null) return
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Element
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !target.closest(`[${FLYOUT_SCOPE_ATTR}]`)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open, pendingRemoval])

  useEffect(() => {
    if (adding) draftInputRef.current?.focus()
  }, [adding])

  function toggleTag(name: string) {
    onTagsChange(
      activeTags.includes(name)
        ? activeTags.filter((tag) => tag !== name)
        : [...activeTags, name]
    )
  }

  function beginTag() {
    if (saving) return
    closingDraftRef.current = false
    setStatus(null)
    setDraft("")
    setDraftMounted(true)
    setAdding(true)
  }

  function closeDraft() {
    closingDraftRef.current = true
    draftInputRef.current?.blur()
    setAdding(false)
  }

  function cancelDraft() {
    if (saving) return
    setStatus(null)
    closeDraft()
  }

  function handleDraftAnimationEnd(event: AnimationEvent<HTMLSpanElement>) {
    if (
      event.currentTarget === event.target &&
      !adding &&
      event.animationName === "practice-tag-form-close"
    ) {
      setDraft("")
      setDraftMounted(false)
    }
  }

  function saveDraft() {
    const name = draft.trim()
    if (!name || saving) return

    setStatus(null)
    startTransition(async () => {
      try {
        const created = await createPracticeTag(name)
        setTags((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
        closeDraft()
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to save tag")
      }
    })
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      if (draft.trim()) void saveDraft()
    }
    if (event.key === "Escape") {
      event.preventDefault()
      cancelDraft()
    }
  }

  function requestTagRemoval(tag: PracticeTag) {
    if (saving) return
    setStatus(null)
    setPendingRemoval(tag)
  }

  function removePendingTag() {
    const tag = pendingRemoval
    if (!tag || saving) return

    setStatus(null)
    startTransition(async () => {
      try {
        await deletePracticeTag(tag.id)
        setTags((current) => current.filter((item) => item.id !== tag.id))
        setPendingRemoval(null)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to remove tag")
      }
    })
  }

  return (
    <>
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="true"
          aria-label="Filter by tag"
          className={controlClass}
        >
          <TagIcon />
          {activeTags.length > 0 && (
            <span aria-hidden className="absolute -right-1.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-[3px] text-[10px] font-semibold text-primary-text">
              {activeTags.length}
            </span>
          )}
          {!open && <HoverDetail label="Filter by tag" />}
        </button>
        {open &&
          createPortal(
            <div
              ref={panelRef}
              {...{ [FLYOUT_SCOPE_ATTR]: true }}
              style={{ position: "fixed", top: position?.top ?? -9999, left: position?.left ?? -9999 }}
              className="z-40 flex max-h-[360px] w-max min-w-[180px] max-w-[280px] flex-col overflow-hidden rounded-xl border border-border-secondary bg-background p-2 shadow-lg"
            >
              <div className="mb-1.5 flex shrink-0 items-center justify-between gap-3 border-b border-border-secondary px-2 pb-2 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Filter by tag</span>
                {activeTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onTagsChange([])}
                    className="text-xs font-medium text-primary hover:opacity-80"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                {tags.map((tag) => {
                  const selected = activeTags.includes(tag.name)
                  return (
                    <div key={tag.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleTag(tag.name)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-fill-secondary"
                      >
                        <span
                          aria-hidden
                          className={
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                            (selected
                              ? "border-primary bg-primary text-primary-text"
                              : "border-border-secondary")
                          }
                        >
                          {selected && <ActionIcon kind="check" className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{tag.name}</span>
                      </button>
                      {isCoach && (
                        <button
                          type="button"
                          onClick={() => requestTagRemoval(tag)}
                          disabled={saving}
                          aria-label={`Remove ${tag.name}`}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition hover:bg-fill-secondary hover:text-foreground disabled:opacity-50"
                        >
                          <ActionIcon kind="close" className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
                {tags.length === 0 && (
                  <p className="px-1 py-2 text-sm text-foreground-tertiary">No tags yet.</p>
                )}
              </div>
              {isCoach && (
                <div className="mt-1.5 shrink-0 border-t border-border-secondary pt-1.5">
                  {draftMounted ? (
                    <span
                      className={`practice-tag-form-${adding ? "open" : "close"} relative flex items-center gap-1`}
                      onAnimationEnd={handleDraftAnimationEnd}
                      onBlur={(event) => {
                        if (closingDraftRef.current) return
                        const nextTarget = event.relatedTarget
                        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
                        cancelDraft()
                      }}
                    >
                      <input
                        ref={draftInputRef}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleDraftKeyDown}
                        maxLength={PRACTICE_TAG_NAME_MAX_LENGTH}
                        disabled={saving}
                        aria-label="New practice tag"
                        className="w-full min-w-0 flex-1 rounded-md border border-primary bg-fill-secondary px-2 py-1.5 text-[13px] text-foreground outline-none ring-2 ring-primary/20 placeholder:text-foreground-tertiary disabled:opacity-50"
                        placeholder="New tag"
                      />
                      <button
                        type="button"
                        onClick={() => void saveDraft()}
                        disabled={saving || !draft.trim()}
                        aria-label="Save new practice tag"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-text transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ActionIcon kind="check" className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelDraft}
                        disabled={saving}
                        aria-label="Cancel new practice tag"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ActionIcon kind="close" className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={beginTag}
                      disabled={saving || tags.length >= PRACTICE_TAG_MAX_COUNT}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground disabled:opacity-50"
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                      </svg>
                      Add tag
                    </button>
                  )}
                  {tags.length >= PRACTICE_TAG_MAX_COUNT && (
                    <p className="px-2 pb-1 text-xs text-foreground-secondary">
                      Limit of {PRACTICE_TAG_MAX_COUNT} tags reached. Remove a tag to add another.
                    </p>
                  )}
                </div>
              )}
              {status && (
                <p role="status" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {status}
                </p>
              )}
            </div>,
            document.body
          )}
      </div>
      <Modal
        open={pendingRemoval !== null}
        onClose={() => !saving && setPendingRemoval(null)}
        closeDisabled={saving}
        title="Remove shared tag"
        description={
          <>
            Remove <span className="font-medium text-foreground">{pendingRemoval?.name}</span> from the shared practice tags? This will also remove it from practices that currently use it.
          </>
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setPendingRemoval(null)}
              disabled={saving}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:bg-fill-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={removePendingTag}
              disabled={saving}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Removing…" : "Remove tag"}
            </button>
          </ModalFooter>
        }
      >
        {status && <p role="status" className="text-sm text-red-600 dark:text-red-400">{status}</p>}
      </Modal>
    </>
  )
}
