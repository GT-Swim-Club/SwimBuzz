"use client"

import Link from "next/link"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PRACTICE_TAG_MAX_COUNT, PRACTICE_TAG_NAME_MAX_LENGTH } from "@/lib/practice-tags"
import Modal, { ModalFooter } from "@/components/Modal"
import ActionIcon from "@/components/ActionIcon"
import HoverDetail from "@/components/HoverDetail"

type PracticeTag = { id: string; name: string }

const chipClass = "rounded-full border border-border-secondary px-2.5 py-1 text-xs transition-colors"

export default function PracticeTagManager({
  initialTags,
  isCoach,
}: {
  initialTags: PracticeTag[]
  isCoach: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const draftInputRef = useRef<HTMLInputElement>(null)
  const [tags, setTags] = useState(initialTags)
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<PracticeTag | null>(null)
  const activeTags = searchParams.getAll("tag")

  useEffect(() => {
    if (adding) draftInputRef.current?.focus()
  }, [adding])

  function filterHref(nextTags: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("tag")
    nextTags.forEach((tag) => params.append("tag", tag))
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  function toggleHref(name: string) {
    return filterHref(
      activeTags.includes(name)
        ? activeTags.filter((tag) => tag !== name)
        : [...activeTags, name]
    )
  }

  function beginTag() {
    if (saving) return
    setStatus(null)
    setDraft("")
    setAdding(true)
  }

  function cancelDraft() {
    if (saving) return
    setDraft("")
    setStatus(null)
    setAdding(false)
  }

  async function saveDraft() {
    const name = draft.trim()
    if (!name || saving) return

    setSaving(true)
    setStatus(null)
    try {
      const response = await fetch("/api/practice-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Unable to save tag")
      setTags((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
      setDraft("")
      setAdding(false)
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save tag")
    } finally {
      setSaving(false)
    }
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

  async function removePendingTag() {
    const tag = pendingRemoval
    if (!tag || saving) return

    setSaving(true)
    setStatus(null)
    try {
      const response = await fetch("/api/practice-tags/" + tag.id, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Unable to remove tag")
      setTags((current) => current.filter((item) => item.id !== tag.id))
      setPendingRemoval(null)
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to remove tag")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={filterHref([])}
          className={
            chipClass + " font-semibold " +
            (activeTags.length === 0
              ? "bg-primary border-primary text-primary-text"
              : "text-foreground-secondary hover:bg-fill-secondary")
          }
        >
          All
        </Link>
        {tags.map((tag) => {
          const selected = activeTags.includes(tag.name)
          const tagTone = selected
            ? "bg-primary border-primary text-primary-text"
            : "text-foreground-secondary hover:bg-fill-secondary"

          if (!isCoach) {
            return (
              <Link key={tag.id} href={toggleHref(tag.name)} className={chipClass + " " + tagTone}>
                {tag.name}
              </Link>
            )
          }

          return (
            <span key={tag.id} className={"inline-flex items-center overflow-hidden " + chipClass + " " + tagTone}>
              <Link
                href={toggleHref(tag.name)}
                className="inline-flex items-center pl-0.5 pr-1.5"
              >
                {tag.name}
              </Link>
              <button
                type="button"
                onClick={() => requestTagRemoval(tag)}
                disabled={saving}
                aria-label={`Remove ${tag.name}`}
                className={
                  "inline-flex h-4 w-4 shrink-0 items-center justify-center transition disabled:opacity-50 " +
                  (selected
                    ? "text-primary-text/90 hover:bg-primary-hover hover:text-primary-text"
                    : "text-foreground-tertiary hover:bg-background/20 hover:text-current")
                }
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                  <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          )
        })}
        {isCoach && tags.length < PRACTICE_TAG_MAX_COUNT && (adding ? (
          <span
            className="relative inline-flex items-center"
            onBlur={(event) => {
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
              className={chipClass + " w-32 border-primary bg-fill-secondary pr-11 text-foreground outline-none ring-2 ring-primary/20 placeholder:text-foreground-tertiary disabled:opacity-50"}
              placeholder="New tag"
            />
            <span className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={saving || !draft.trim()}
                aria-label="Save new practice tag"
                className="group relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-text transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ActionIcon kind="check" className="h-3 w-3" />
                <HoverDetail label="Save tag" />
              </button>
              <button
                type="button"
                onClick={cancelDraft}
                disabled={saving}
                aria-label="Cancel new practice tag"
                className="group relative inline-flex h-4 w-4 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ActionIcon kind="close" className="h-3 w-3" />
                <HoverDetail label="Cancel" />
              </button>
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={beginTag}
            disabled={saving}
            aria-label="Add a practice tag"
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border-secondary text-foreground-secondary transition-colors hover:bg-fill-secondary disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3 w-3">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        ))}
      </div>
      {status && <p role="status" className="text-xs text-red-600 dark:text-red-400">{status}</p>}
      </div>
      <Modal
        open={pendingRemoval !== null}
        onClose={() => !saving && setPendingRemoval(null)}
        closeDisabled={saving}
        title="Remove shared tag"
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
        <p className="text-sm text-foreground-secondary">
          Remove <span className="font-medium text-foreground">{pendingRemoval?.name}</span> from the shared practice tags? This will also remove it from practices that currently use it.
        </p>
        {status && <p role="status" className="mt-3 text-sm text-red-600 dark:text-red-400">{status}</p>}
      </Modal>
    </>
  )
}
