"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import { LedgerIcon } from "@/components/meet/Ledger"
import type { RosterPairingOption } from "@/components/meet/AthletePairingProvider"

const UNMATCHED = "Leave unmatched"

type Option = { kind: "athlete"; id: string; label: string; search: string; hint?: string }
/** Rows under the athletes that act instead of picking: widen the search, or create an athlete. */
type Action = { kind: "action"; id: "all-seasons" | "create"; label: string }
type Item = Option | Action

/** "2024–2025" for an athlete's latest season, when it isn't `season`. */
function otherSeasonHint(athlete: RosterPairingOption, season: string | undefined): string | undefined {
  const seasons = athlete.seasons ?? []
  if (seasons.length === 0 || (season && seasons.includes(season))) return undefined
  const latest = [...seasons].sort().at(-1)
  return latest ? formatSeasonLabel(latest) : undefined
}

/** "Page, Cole" (just the last name when there's no first). */
function lastFirst(athlete: RosterPairingOption): string {
  return athlete.firstName ? `${athlete.lastName}, ${athlete.firstName}` : athlete.lastName
}

/** Options from "Last, First" names, as the meet page's roster lists them. */
export function rosterOptionsFromLastFirst(athletes: { id: string; name: string }[]): RosterPairingOption[] {
  return athletes.map(({ id, name }) => {
    const comma = name.indexOf(", ")
    return comma < 0
      ? { id, firstName: "", lastName: name }
      : { id, lastName: name.slice(0, comma), firstName: name.slice(comma + 2) }
  })
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/**
 * The pairing dialog's roster dropdown, searchable: typing filters athletes by first or last name
 * in any order ("natalie", "plant", "nat plan"). Its list opens in a portal so the dialog's
 * scrolling body can't clip it. With `allSeasons`, a "Search all seasons" row switches this
 * dropdown to every athlete (each from another season tagged with their latest one), keeping
 * what's typed; with `onCreate`, a last row creates an athlete for the name. With `placeholder`
 * (the add swim / entry dialogs) there's no "Leave unmatched" row: an empty field shows it instead.
 */
export default function AthletePairingSelect({
  value,
  roster,
  onChange,
  label,
  season,
  allSeasons,
  createLabel,
  onCreate,
  placeholder,
}: {
  /** The paired athlete's id, or "" for unmatched. */
  value: string
  roster: RosterPairingOption[]
  onChange: (athleteId: string) => void
  /** Accessible name, e.g. "Roster athlete for Page, Cole". */
  label: string
  /** The roster's season, so athletes from other seasons can be told apart. */
  season?: string
  /** Every athlete, all seasons: null until `load` has fetched them. */
  allSeasons?: { athletes: RosterPairingOption[] | null; load: () => void }
  /** The create row's label, e.g. "Create athlete “Cole Page”…". */
  createLabel?: string
  onCreate?: () => void
  /** Shown while nothing is picked, in place of the "Leave unmatched" choice. */
  placeholder?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [scope, setScope] = useState<"season" | "all">("season")
  const everyone = allSeasons?.athletes ?? null
  const loadingAll = scope === "all" && !everyone

  const options = useMemo<Option[]>(() => {
    const pool = scope === "all" && everyone ? everyone : roster
    return [
      ...(placeholder ? [] : [{ kind: "athlete" as const, id: "", label: UNMATCHED, search: "" }]),
      ...pool.map((a) => ({
        kind: "athlete" as const,
        id: a.id,
        label: lastFirst(a),
        search: fold(`${a.firstName} ${a.lastName}`),
        hint: scope === "all" ? otherSeasonHint(a, season) : undefined,
      })),
    ]
  }, [scope, everyone, roster, season, placeholder])
  const selected = value
    ? (roster.find((a) => a.id === value) ?? everyone?.find((a) => a.id === value))
    : undefined
  const selectedLabel = selected ? lastFirst(selected) : placeholder ? "" : UNMATCHED

  const matches = useMemo(() => {
    const tokens = fold(query).split(/[\s,]+/).filter(Boolean)
    if (tokens.length === 0) return options
    return options.filter((o) => o.id && tokens.every((t) => o.search.includes(t)))
  }, [options, query])

  const items = useMemo<Item[]>(() => {
    const actions: Action[] = []
    if (allSeasons && scope === "season") actions.push({ kind: "action", id: "all-seasons", label: "Search all seasons" })
    if (onCreate && createLabel) actions.push({ kind: "action", id: "create", label: createLabel })
    return [...(loadingAll ? [] : matches), ...actions]
  }, [matches, allSeasons, scope, onCreate, createLabel, loadingAll])
  const highlighted = Math.min(active, Math.max(0, items.length - 1))

  const place = useCallback(() => {
    const box = inputRef.current?.getBoundingClientRect()
    if (box) setRect({ top: box.bottom + 4, left: box.left, width: box.width })
  }, [])

  function openList() {
    if (open) return
    setQuery("")
    setActive(Math.max(0, options.findIndex((o) => o.id === value)))
    place()
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setQuery("")
  }

  function pick(item: Item | undefined) {
    if (!item) return
    if (item.kind === "action" && item.id === "all-seasons") {
      // Widen in place: the list stays open with what's typed.
      setScope("all")
      setActive(0)
      allSeasons?.load()
      return
    }
    close()
    if (item.kind === "action") onCreate?.()
    else onChange(item.id)
  }

  useLayoutEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [open, highlighted])

  useEffect(() => {
    if (!open) return
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, place])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[highlighted] ? `${listId}-${highlighted}` : undefined}
        autoComplete="off"
        value={open ? query : selectedLabel}
        placeholder={
          open ? (scope === "all" ? "Search all seasons" : `Search ${roster.length} athletes`) : placeholder
        }
        onFocus={openList}
        onClick={openList}
        onBlur={close}
        onChange={(e) => {
          if (!open) openList()
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            if (!open) return openList()
            const step = e.key === "ArrowDown" ? 1 : -1
            setActive(Math.min(Math.max(highlighted + step, 0), items.length - 1))
          } else if (e.key === "Enter") {
            // Inside the dialog's form: pick, don't submit.
            if (!open) return
            e.preventDefault()
            pick(items[highlighted])
          } else if (e.key === "Escape" && open) {
            // Close the list, not the dialog.
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        className={`w-full cursor-pointer rounded-lg border border-border-secondary bg-background py-2 pl-3 pr-9 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-foreground-tertiary focus:cursor-text focus:border-primary focus:ring-[3px] focus:ring-primary/35 ${
          !open && !value ? "text-foreground-secondary" : ""
        }`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close list" : "Open list"}
        // Keep focus in the input: its blur would close the list before this click toggles it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) return close()
          inputRef.current?.focus()
          openList()
        }}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-foreground-tertiary transition-colors hover:text-foreground"
      >
        <AppIcon
          name="chevronDown"
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={label}
              data-floating-popover
              // Keep focus in the input so its blur doesn't close the list before a pick.
              onMouseDown={(e) => e.preventDefault()}
              style={{ top: rect.top, left: rect.left, width: rect.width }}
              className="fixed z-[60] max-h-64 overflow-auto rounded-lg border border-border bg-background-elevated py-1 shadow-lg"
            >
              {loadingAll ? (
                <li className="px-3 py-2 text-sm text-foreground-secondary">Loading all seasons…</li>
              ) : matches.length === 0 ? (
                <li className="px-3 py-2 text-sm text-foreground-secondary">No matching athletes</li>
              ) : null}
              {items.map((item, i) => {
                const firstAction = item.kind === "action" && items[i - 1]?.kind !== "action"
                return (
                  <li
                    key={item.kind === "action" ? item.id : item.id || "unmatched"}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={item.kind === "athlete" && item.id === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(item)}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm ${
                      i === highlighted ? "bg-background-hover" : ""
                    } ${item.kind === "action" || !item.id ? "text-foreground-secondary" : "text-foreground"} ${
                      firstAction && i > 0 ? "border-t border-border-secondary" : ""
                    }`}
                  >
                    {item.kind === "action" ? (
                      <>
                        {item.id === "create" ? (
                          <LedgerIcon name="userPlus" className="h-4 w-4 shrink-0" />
                        ) : (
                          <AppIcon name="search" className="h-4 w-4 shrink-0" />
                        )}
                        <span className="truncate">{item.label}</span>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint ? (
                          <span className="shrink-0 text-xs tabular-nums text-foreground-tertiary">{item.hint}</span>
                        ) : null}
                        {item.id === value ? <AppIcon name="check" className="h-4 w-4 shrink-0 text-primary" /> : null}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>,
            document.body
          )
        : null}
    </div>
  )
}
