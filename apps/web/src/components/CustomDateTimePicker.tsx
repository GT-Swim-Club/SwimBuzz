"use client"

import { type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { formatClockTime } from "@swimbuzz/shared"

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1)
const QUICK_MINUTES = [0, 15, 30, 45]
const VIEWPORT_MARGIN = 12

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel: string
  clearable?: boolean
  required?: boolean
  disabled?: boolean
  /** Show a validation error supplied by the calling form. */
  hasError?: boolean
  /** Inclusive earliest selectable date (YYYY-MM-DD). */
  min?: string
  /** Inclusive latest selectable date (YYYY-MM-DD). */
  max?: string
}

type TimePickerProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel: string
  clearable?: boolean
  disabled?: boolean
  /** Show a validation error supplied by the calling form. */
  hasError?: boolean
  /** Earliest selectable time (HH:MM). */
  min?: string
  /** When true with `min`, the min time itself is not selectable. */
  minExclusive?: boolean
}

type Period = "AM" | "PM"
type FloatingPosition = { top: number; left: number; maxHeight: number }

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

function makeDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

function fullYear(value: number) {
  return value < 100 ? (value < 70 ? 2000 + value : 1900 + value) : value
}

function relativeWeekday(dayName: string, modifier?: string) {
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const target = weekdays.indexOf(dayName.toLowerCase())
  if (target < 0) return null
  const today = new Date()
  const result = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let offset = (target - result.getDay() + 7) % 7
  if (modifier === "next") offset = offset || 7
  if (modifier === "last") offset = -((result.getDay() - target + 7) % 7 || 7)
  result.setDate(result.getDate() + offset)
  return result
}

function parseTypedDate(value: string) {
  const raw = value.trim()
  if (!raw) return null
  const iso = parseDate(raw)
  if (iso) return iso

  const lower = raw.toLowerCase().replace(/\s+/g, " ").trim()
  const today = new Date()
  if (lower === "today") return today
  if (lower === "tomorrow") return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (lower === "yesterday") return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)

  const weekdayMatch = /^(?:(next|this|last)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i.exec(lower)
  if (weekdayMatch) return relativeWeekday(weekdayMatch[2], weekdayMatch[1]?.toLowerCase())

  const normalized = raw
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const numeric = /^(\d{1,4})[./\-\s](\d{1,2})[./\-\s](\d{1,4})$/.exec(normalized)
  if (numeric) {
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    const third = Number(numeric[3])
    if (numeric[1].length === 4) return makeDate(first, second, third)
    const year = fullYear(third)
    if (first > 12) return makeDate(year, second, first)
    return makeDate(year, first, second)
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return makeDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function displayDate(value: string) {
  const date = parseDate(value)
  if (!date) return ""
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function sameDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

function dayOutOfRange(day: Date, min?: string, max?: string) {
  const value = dateValue(day)
  if (min && value < min) return true
  if (max && value > max) return true
  return false
}

function clampDateToRange(day: Date, min?: string, max?: string) {
  const value = dateValue(day)
  if (min && value < min) return parseDate(min) ?? day
  if (max && value > max) return parseDate(max) ?? day
  return day
}

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function parseTypedTime(value: string) {
  const trimmed = value.trim().toUpperCase().replace(/\./g, ":")
  if (!trimmed) return null
  const compact = /^(\d{3,4})\s*(AM|PM)?$/.exec(trimmed)
  if (compact) {
    const digits = compact[1]
    const period = compact[2] as Period | undefined
    const rawHour = Number(digits.slice(0, -2))
    const minute = Number(digits.slice(-2))
    if (minute > 59) return null
    if (period) return rawHour >= 1 && rawHour <= 12 ? { hour: to24Hour(rawHour, period), minute } : null
    return rawHour <= 23 ? { hour: rawHour, minute } : null
  }
  const match = /^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/.exec(trimmed)
  if (!match) return null
  const rawHour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  const period = match[3] as Period | undefined
  if (minute < 0 || minute > 59) return null
  if (period) {
    if (rawHour < 1 || rawHour > 12) return null
    return { hour: to24Hour(rawHour, period), minute }
  }
  if (rawHour < 0 || rawHour > 23) return null
  return { hour: rawHour, minute }
}

function timeValue(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`
}

function timeToMinutes(hour: number, minute: number) {
  return hour * 60 + minute
}

function parseTimeMinutes(value?: string) {
  if (!value) return null
  const parsed = parseTime(value)
  if (!parsed) return null
  return timeToMinutes(parsed.hour, parsed.minute)
}

function timeOutOfRange(hour: number, minute: number, min?: string, minExclusive = false) {
  const minMinutes = parseTimeMinutes(min)
  if (minMinutes == null) return false
  const minutes = timeToMinutes(hour, minute)
  return minExclusive ? minutes <= minMinutes : minutes < minMinutes
}

function earliestAllowedTime(min?: string, minExclusive = false) {
  const minMinutes = parseTimeMinutes(min)
  if (minMinutes == null) return null
  const allowed = minExclusive ? minMinutes + 1 : minMinutes
  if (allowed > 23 * 60 + 59) return null
  return { hour: Math.floor(allowed / 60), minute: allowed % 60 }
}

function displayTime(value: string) {
  const parsed = parseTime(value)
  if (!parsed) return ""
  return formatClockTime(`${pad(parsed.hour)}:${pad(parsed.minute)}`)
}

function roundedNow() {
  const now = new Date()
  return { hour: now.getHours(), minute: now.getMinutes() }
}

function to24Hour(hour: number, period: Period) {
  return hour % 12 + (period === "PM" ? 12 : 0)
}

function calculatePosition(
  trigger: HTMLElement,
  width: number,
  estimatedHeight: number
): FloatingPosition {
  const rect = trigger.getBoundingClientRect()
  const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft))
  const gap = 0
  const roomBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN - gap
  const roomAbove = rect.top - VIEWPORT_MARGIN - gap
  const placeBelow = roomBelow >= estimatedHeight || roomBelow >= roomAbove
  const availableHeight = Math.max(96, placeBelow ? roomBelow : roomAbove)
  const maxHeight = Math.min(estimatedHeight, availableHeight)
  const top = placeBelow ? rect.bottom + gap : Math.max(VIEWPORT_MARGIN, rect.top - gap - maxHeight)
  return { top, left, maxHeight }
}

function useFloatingPicker(width: number, estimatedHeight: number) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<FloatingPosition>({ top: 0, left: 0, maxHeight: 0 })
  const fieldRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const reposition = useCallback(() => {
    if (!fieldRef.current) return
    const measuredHeight = panelRef.current?.getBoundingClientRect().height
    const placementHeight = measuredHeight && measuredHeight > 0 ? measuredHeight : estimatedHeight
    setPosition(calculatePosition(fieldRef.current, width, placementHeight))
  }, [estimatedHeight, width])
  const openPicker = useCallback(() => {
    reposition()
    setOpen(true)
  }, [reposition])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (!fieldRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        close()
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") close()
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    }
  }, [close, open, reposition])

  return { close, fieldRef, open, openPicker, panelRef, position }
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
      <path d={direction === "left" ? "m14.5 5-7 7 7 7" : "m9.5 5 7 7-7 7"} />
    </svg>
  )
}

type PickerToggleIconKind = "calendar" | "clock"

function PickerToggleIcon({ icon }: { icon: PickerToggleIconKind }) {
  if (icon === "calendar") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" />
    </svg>
  )
}

function PickerTrigger({
  fieldRef,
  label,
  icon,
  textValue,
  placeholder,
  open,
  invalid,
  disabled,
  onTextChange,
  onTextFocus,
  onTextBlur,
  onTextKeyDown,
  onFieldClick,
  onPickerClick,
}: {
  fieldRef: RefObject<HTMLDivElement | null>
  label: string
  icon: PickerToggleIconKind
  textValue: string
  placeholder: string
  open: boolean
  invalid: boolean
  disabled?: boolean
  onTextChange: (value: string) => void
  onTextFocus: () => void
  onTextBlur: () => void
  onTextKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onFieldClick: () => void
  onPickerClick: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      ref={fieldRef}
      onMouseDown={(event) => {
        if (disabled || (event.target as HTMLElement).closest("button")) return
        onFieldClick()
        if (event.target !== inputRef.current) {
          event.preventDefault()
          inputRef.current?.focus()
        }
      }}
      className={`flex min-h-0 w-full items-center gap-1 rounded-lg border bg-background px-3 py-2 text-sm transition focus-within:ring-2 ${
        invalid
          ? "border-error focus-within:border-error focus-within:ring-error/10"
          : "border-border focus-within:border-primary focus-within:ring-primary/10"
      }`}
    >
      <input
        ref={inputRef}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={textValue}
        onChange={(event) => onTextChange(event.target.value)}
        onFocus={onTextFocus}
        onBlur={onTextBlur}
        onKeyDown={onTextKeyDown}
        placeholder={placeholder}
        className="sb-picker-inline-input min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-tertiary disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        aria-label={`Toggle ${label} picker`}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={onPickerClick}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-foreground-tertiary transition hover:bg-fill-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/45 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PickerToggleIcon icon={icon} />
      </button>
    </div>
  )
}

function FloatingPopover({
  open,
  panelRef,
  position,
  width,
  scrollable = true,
  children,
}: {
  open: boolean
  panelRef: RefObject<HTMLDivElement | null>
  position: FloatingPosition
  width: number
  scrollable?: boolean
  children: ReactNode
}) {
  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      className="fixed z-[70] rounded-xl border border-border bg-background-elevated p-3 shadow-2xl shadow-black/30"
      style={scrollable
        ? { left: position.left, top: position.top, width, maxHeight: position.maxHeight, overflowY: "auto" }
        : { left: position.left, top: position.top, width }}
    >
      {children}
    </div>,
    document.body
  )
}

const iconButtonClass = "grid h-7 w-7 place-items-center rounded-md text-foreground-secondary transition hover:bg-fill-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/45"
const optionClass = "grid h-8 place-items-center rounded-md text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/45"

export function DatePicker({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
  ariaLabel,
  clearable = false,
  required = false,
  disabled = false,
  hasError = false,
  min,
  max,
}: DatePickerProps) {
  const [viewDate, setViewDate] = useState<Date>(() => parseDate(value) ?? new Date())
  const [textValue, setTextValue] = useState(() => displayDate(value))
  const [invalid, setInvalid] = useState(false)
  const today = useMemo(() => new Date(), [])
  const floating = useFloatingPicker(288, 352)
  const todaySelectable = !dayOutOfRange(today, min, max)

  useEffect(() => {
    setTextValue(displayDate(value))
    const parsed = parseDate(value)
    if (parsed) setViewDate(parsed)
    setInvalid(false)
  }, [value])

  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const calendarStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - firstOfMonth.getDay())
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart)
    day.setDate(calendarStart.getDate() + index)
    return day
  })

  function commitDate(nextValue: string) {
    onChange(nextValue)
    setTextValue(displayDate(nextValue))
    setInvalid(false)
  }

  function commitTypedDate() {
    if (!textValue.trim()) {
      commitDate("")
      return
    }
    const parsed = parseTypedDate(textValue)
    if (!parsed) {
      setInvalid(true)
      return
    }
    if (dayOutOfRange(parsed, min, max)) {
      setInvalid(true)
      return
    }
    commitDate(dateValue(parsed))
  }

  function openForInput() {
    if (floating.open) return
    const parsed = parseTypedDate(textValue) ?? parseDate(value) ?? new Date()
    setViewDate(parsed)
    floating.openPicker()
  }

  function handleTextChange(nextValue: string) {
    setTextValue(nextValue)
    setInvalid(false)
    const parsed = parseTypedDate(nextValue)
    if (parsed) setViewDate(parsed)
    if (!floating.open) floating.openPicker()
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  function togglePicker() {
    if (floating.open) floating.close()
    else openForInput()
  }

  return (
    <div>
      <PickerTrigger
        fieldRef={floating.fieldRef}
        label={ariaLabel}
        icon="calendar"
        textValue={textValue}
        placeholder={placeholder}
        open={floating.open}
        invalid={invalid || hasError}
        disabled={disabled}
        onTextChange={handleTextChange}
        onTextFocus={openForInput}
        onTextBlur={commitTypedDate}
        onTextKeyDown={handleTextKeyDown}
        onFieldClick={openForInput}
        onPickerClick={togglePicker}
      />
      {required && <input type="hidden" value={value} required readOnly />}
      <FloatingPopover open={floating.open} panelRef={floating.panelRef} position={floating.position} width={288}>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <Chevron direction="left" />
          </button>
          <p className="text-sm font-semibold text-foreground">
            {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <Chevron direction="right" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Calendar days">
          {WEEKDAYS.map((weekday, index) => (
            <span key={`${weekday}-${index}`} className="pb-0.5 text-center text-[10px] font-semibold uppercase text-foreground-tertiary">
              {weekday}
            </span>
          ))}
          {days.map((day) => {
            const nextValue = dateValue(day)
            const selected = value === nextValue
            const isToday = sameDay(day, today)
            const outsideMonth = day.getMonth() !== viewDate.getMonth()
            const outOfRange = dayOutOfRange(day, min, max)
            return (
              <button
                type="button"
                key={nextValue}
                disabled={outOfRange}
                onClick={() => {
                  if (outOfRange) return
                  commitDate(nextValue)
                  floating.close()
                }}
                aria-label={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                aria-pressed={selected}
                aria-disabled={outOfRange}
                className={`${optionClass} ${
                  outOfRange
                    ? "cursor-not-allowed text-foreground-quaternary opacity-40"
                    : selected
                      ? "bg-primary font-bold text-primary-text"
                      : isToday
                        ? "bg-primary-bg font-bold text-primary-active hover:bg-primary-bg-hover"
                        : outsideMonth
                          ? "text-foreground-quaternary hover:bg-fill-secondary"
                          : "text-foreground hover:bg-fill-secondary"
                }`}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          {clearable ? (
            <button type="button" onClick={() => { commitDate(""); floating.close() }} className="rounded px-1.5 py-1 text-xs font-medium text-foreground-secondary transition hover:bg-fill-secondary hover:text-foreground">
              Clear
            </button>
          ) : <span />}
          <button
            type="button"
            disabled={!todaySelectable}
            onClick={() => {
              if (!todaySelectable) return
              commitDate(dateValue(clampDateToRange(today, min, max)))
              floating.close()
            }}
            className="rounded px-1.5 py-1 text-xs font-semibold text-primary-active transition hover:bg-primary-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Today
          </button>
        </div>
      </FloatingPopover>
    </div>
  )
}

export function TimePicker({
  value,
  onChange,
  placeholder = "e.g. 6:45 PM",
  ariaLabel,
  clearable = true,
  disabled = false,
  hasError = false,
  min,
  minExclusive = false,
}: TimePickerProps) {
  const initial = parseTime(value) ?? roundedNow()
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [textValue, setTextValue] = useState(() => displayTime(value))
  const [invalid, setInvalid] = useState(false)
  const floating = useFloatingPicker(256, 280)
  const period: Period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 || 12
  const earliest = earliestAllowedTime(min, minExclusive)

  useEffect(() => {
    const next = parseTime(value)
    if (next) {
      setHour(next.hour)
      setMinute(next.minute)
    }
    setTextValue(displayTime(value))
    setInvalid(false)
  }, [value])

  function commitTime(nextValue: string) {
    onChange(nextValue)
    setTextValue(displayTime(nextValue))
    setInvalid(false)
  }

  function commitTypedTime() {
    if (!textValue.trim()) {
      commitTime("")
      return
    }
    const parsed = parseTypedTime(textValue)
    if (!parsed) {
      setInvalid(true)
      return
    }
    if (timeOutOfRange(parsed.hour, parsed.minute, min, minExclusive)) {
      setInvalid(true)
      return
    }
    commitTime(timeValue(parsed.hour, parsed.minute))
  }

  function openForInput() {
    if (floating.open) return
    const next = parseTypedTime(textValue) ?? parseTime(value) ?? roundedNow()
    setHour(next.hour)
    setMinute(next.minute)
    floating.openPicker()
  }

  function handleTextChange(nextValue: string) {
    setTextValue(nextValue)
    setInvalid(false)
    const parsed = parseTypedTime(nextValue)
    if (parsed) {
      setHour(parsed.hour)
      setMinute(parsed.minute)
    }
    if (!floating.open) floating.openPicker()
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }


  function togglePicker() {
    if (floating.open) floating.close()
    else openForInput()
  }

  function applyTime(nextHour: number, nextMinute: number) {
    if (timeOutOfRange(nextHour, nextMinute, min, minExclusive)) return
    setHour(nextHour)
    setMinute(nextMinute)
    commitTime(timeValue(nextHour, nextMinute))
  }

  function selectPeriod(nextPeriod: Period) {
    applyTime(to24Hour(hour12, nextPeriod), minute)
  }

  function hourDisabled(option: number) {
    const nextHour = to24Hour(option, period)
    return QUICK_MINUTES.every((optionMinute) =>
      timeOutOfRange(nextHour, optionMinute, min, minExclusive)
    )
  }

  function minuteDisabled(option: number) {
    return timeOutOfRange(hour, option, min, minExclusive)
  }

  function periodDisabled(nextPeriod: Period) {
    return HOURS.every((option) => {
      const nextHour = to24Hour(option, nextPeriod)
      return QUICK_MINUTES.every((optionMinute) =>
        timeOutOfRange(nextHour, optionMinute, min, minExclusive)
      )
    })
  }

  const now = roundedNow()
  const nowAllowed = !timeOutOfRange(now.hour, now.minute, min, minExclusive)

  return (
    <div>
      <PickerTrigger
        fieldRef={floating.fieldRef}
        label={ariaLabel}
        icon="clock"
        textValue={textValue}
        placeholder={placeholder}
        open={floating.open}
        invalid={invalid || hasError}
        disabled={disabled}
        onTextChange={handleTextChange}
        onTextFocus={openForInput}
        onTextBlur={commitTypedTime}
        onTextKeyDown={handleTextKeyDown}
        onFieldClick={openForInput}
        onPickerClick={togglePicker}
      />
      <FloatingPopover open={floating.open} panelRef={floating.panelRef} position={floating.position} width={256} scrollable={false}>
        <div className="mb-2 grid grid-cols-2 rounded-md bg-fill-secondary p-0.5">
          {(["AM", "PM"] as Period[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={period === option}
              disabled={periodDisabled(option)}
              onClick={() => selectPeriod(option)}
              className={`rounded px-2 py-1 text-xs font-semibold transition ${
                periodDisabled(option)
                  ? "cursor-not-allowed text-foreground-quaternary opacity-40"
                  : period === option
                    ? "bg-primary font-bold text-primary-text"
                    : "text-foreground-secondary hover:text-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-tertiary">Hour</p>
        <div className="mb-2 grid grid-cols-6 gap-1">
          {HOURS.map((option) => {
            const unavailable = hourDisabled(option)
            return (
              <button
                key={option}
                type="button"
                aria-pressed={hour12 === option}
                disabled={unavailable}
                onClick={() => applyTime(to24Hour(option, period), minute)}
                className={`${optionClass} ${
                  unavailable
                    ? "cursor-not-allowed bg-fill-secondary text-foreground-quaternary opacity-40"
                    : hour12 === option
                      ? "bg-primary font-bold text-primary-text"
                      : "bg-fill-secondary text-foreground-secondary hover:bg-primary-bg hover:text-primary-active"
                }`}
              >
                {option}
              </button>
            )
          })}
        </div>
        <div className="mb-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-tertiary">Minutes</p>
          <div className="mb-2 grid grid-cols-4 gap-1">
            {QUICK_MINUTES.map((option) => {
              const unavailable = minuteDisabled(option)
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={minute === option}
                  disabled={unavailable}
                  onClick={() => applyTime(hour, option)}
                  className={[
                    optionClass,
                    unavailable
                      ? "cursor-not-allowed bg-fill-secondary text-foreground-quaternary opacity-40"
                      : minute === option
                        ? "bg-primary font-bold text-primary-text"
                        : "bg-fill-secondary text-foreground-secondary hover:bg-primary-bg hover:text-primary-active",
                  ].join(" ")}
                >
                  {pad(option)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <div className="flex items-center gap-1">
            {clearable ? (
              <button type="button" onClick={() => { commitTime(""); floating.close() }} className="rounded px-1.5 py-1 text-xs font-medium text-foreground-secondary transition hover:bg-fill-secondary hover:text-foreground">
                Clear
              </button>
            ) : null}
            <button
              type="button"
              disabled={!nowAllowed && !earliest}
              onClick={() => {
                if (nowAllowed) {
                  applyTime(now.hour, now.minute)
                  return
                }
                if (earliest) applyTime(earliest.hour, earliest.minute)
              }}
              className="rounded px-1.5 py-1 text-xs font-semibold text-primary-active transition hover:bg-primary-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Now
            </button>
          </div>
        </div>
      </FloatingPopover>
    </div>
  )
}
