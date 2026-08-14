import React, { useEffect, useMemo, useState } from "react"
import { formatClockTime } from "@swimbuzz/shared"
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { colors, radii, spacing } from "@swimbuzz/tokens"

const c = colors.light
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTES = [0, 15, 30, 45]

type DateSelectorProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  optional?: boolean
  /** Inclusive earliest selectable date (YYYY-MM-DD). */
  min?: string
}

type TimeSelectorProps = {
  label: string
  value: string
  onChange: (value: string) => void
  helperText?: string
  /** Earliest selectable time (HH:MM). */
  min?: string
  /** When true with `min`, the min time itself is not selectable. */
  minExclusive?: boolean
}

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

function dateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function isSameDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

function displayDate(value: string) {
  const date = parseDate(value)
  if (!date) return "Select a date"
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return { hour: 0, minute: 0 }
  const hour = Number(match[1])
  const minute = Number(match[2])
  return {
    hour: hour >= 0 && hour < 24 ? hour : 0,
    minute: minute >= 0 && minute < 60 ? minute : 0,
  }
}

function timeToMinutes(hour: number, minute: number) {
  return hour * 60 + minute
}

function parseTimeMinutes(value?: string) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null
  const { hour, minute } = parseTime(value)
  return timeToMinutes(hour, minute)
}

function timeOutOfRange(hour: number, minute: number, min?: string, minExclusive = false) {
  const minMinutes = parseTimeMinutes(min)
  if (minMinutes == null) return false
  const minutes = timeToMinutes(hour, minute)
  return minExclusive ? minutes <= minMinutes : minutes < minMinutes
}

function dayOutOfRange(day: Date, min?: string) {
  if (!min) return false
  return dateValue(day) < min
}

function timeValue(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`
}

function displayTime(value: string) {
  const { hour, minute } = parseTime(value)
  return formatClockTime(`${pad(hour)}:${pad(minute)}`)
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return <View style={[styles.chevronIcon, direction === "left" && styles.chevronIconLeft]} />
}

function FieldButton({
  label,
  value,
  placeholder,
  helperText,
  kind,
  onPress,
}: {
  label: string
  value: string
  placeholder: string
  helperText?: string
  kind: "date" | "time"
  onPress: () => void
}) {
  const hasValue = Boolean(value)
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${hasValue ? value : placeholder}`}
        onPress={onPress}
        style={({ pressed }) => [styles.fieldButton, pressed && styles.fieldButtonPressed]}
      >
        <View style={[styles.fieldIcon, kind === "time" && styles.timeIcon]}>
          {kind === "date" ? (
            <>
              <View style={styles.fieldIconTop} />
              <View style={styles.fieldIconDots}>
                <View style={styles.fieldIconDot} />
                <View style={styles.fieldIconDot} />
                <View style={styles.fieldIconDot} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.clockHandShort} />
              <View style={styles.clockHandLong} />
            </>
          )}
        </View>
        <View style={styles.fieldCopy}>
          <Text style={[styles.fieldValue, !hasValue && styles.fieldPlaceholder]}>
            {hasValue ? value : placeholder}
          </Text>
          {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
        </View>
        <View style={styles.fieldChevron}>
          <ChevronIcon direction="right" />
        </View>
      </Pressable>
    </View>
  )
}

function Sheet({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close selector"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={styles.sheet}>{children}</View>
      </View>
    </Modal>
  )
}

function SheetHeader({ title, value, onClose }: { title: string; value: string; onClose: () => void }) {
  return (
    <>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeader}>
        <View>
          <Text style={styles.sheetEyebrow}>{title}</Text>
          <Text style={styles.sheetTitle}>{value}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close selector"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeButtonLabel}>×</Text>
        </Pressable>
      </View>
    </>
  )
}

function SheetActions({
  alternateLabel,
  onAlternate,
  onConfirm,
}: {
  alternateLabel: string
  onAlternate: () => void
  onConfirm: () => void
}) {
  return (
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={onAlternate} style={styles.textAction}>
        <Text style={styles.textActionLabel}>{alternateLabel}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onConfirm} style={styles.confirmButton}>
        <Text style={styles.confirmButtonLabel}>Done</Text>
      </Pressable>
    </View>
  )
}

export function DateSelector({
  label,
  value,
  onChange,
  placeholder = "Select a date",
  optional = false,
  min,
}: DateSelectorProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Date>(() => parseDate(value) ?? new Date())
  const today = useMemo(() => new Date(), [])

  useEffect(() => {
    if (open) setDraft(parseDate(value) ?? new Date())
  }, [open, value])

  const first = new Date(draft.getFullYear(), draft.getMonth(), 1)
  const start = new Date(draft.getFullYear(), draft.getMonth(), 1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
  const close = () => setOpen(false)
  const chooseDate = () => {
    if (dayOutOfRange(draft, min)) return
    onChange(dateValue(draft))
    close()
  }
  const todaySelectable = !dayOutOfRange(today, min)

  return (
    <>
      <FieldButton
        label={label}
        value={value ? displayDate(value) : ""}
        placeholder={placeholder}
        kind="date"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <Sheet onClose={close}>
          <SheetHeader title={label} value={displayDate(dateValue(draft))} onClose={close} />
          <View style={styles.monthControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() => setDraft((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              style={styles.monthButton}
            >
              <ChevronIcon direction="left" />
            </Pressable>
            <Text style={styles.monthLabel}>
              {draft.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() => setDraft((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              style={styles.monthButton}
            >
              <ChevronIcon direction="right" />
            </Pressable>
          </View>
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((weekday) => (
              <Text key={weekday} style={styles.weekday}>{weekday}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {days.map((day) => {
              const selected = isSameDay(day, draft)
              const outsideMonth = day.getMonth() !== draft.getMonth()
              const currentDay = isSameDay(day, today)
              const unavailable = dayOutOfRange(day, min)
              return (
                <Pressable
                  key={dateValue(day)}
                  accessibilityRole="button"
                  accessibilityLabel={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  accessibilityState={{ selected, disabled: unavailable }}
                  disabled={unavailable}
                  onPress={() => {
                    if (!unavailable) setDraft(day)
                  }}
                  style={({ pressed }) => [
                    styles.day,
                    selected && styles.daySelected,
                    pressed && !selected && !unavailable && styles.dayPressed,
                    unavailable && styles.dayDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      outsideMonth && styles.dayOutsideMonth,
                      currentDay && !selected && styles.dayToday,
                      selected && styles.dayLabelSelected,
                      unavailable && styles.dayLabelDisabled,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <SheetActions
            alternateLabel={optional ? "Clear" : "Today"}
            onAlternate={() => {
              if (optional) {
                onChange("")
                close()
              } else if (todaySelectable) {
                setDraft(new Date())
              }
            }}
            onConfirm={chooseDate}
          />
        </Sheet>
      ) : null}
    </>
  )
}

export function TimeSelector({
  label,
  value,
  onChange,
  helperText,
  min,
  minExclusive = false,
}: TimeSelectorProps) {
  const [open, setOpen] = useState(false)
  const initial = parseTime(value)
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)

  useEffect(() => {
    if (open) {
      const next = parseTime(value)
      setHour(next.hour)
      setMinute(next.minute)
    }
  }, [open, value])

  const close = () => setOpen(false)
  const draftInvalid = timeOutOfRange(hour, minute, min, minExclusive)
  const selectCurrentTime = () => {
    const now = new Date()
    const nextHour = now.getHours()
    const nextMinute = Math.floor(now.getMinutes() / 15) * 15
    if (timeOutOfRange(nextHour, nextMinute, min, minExclusive)) return
    setHour(nextHour)
    setMinute(nextMinute)
  }

  return (
    <>
      <FieldButton
        label={label}
        value={value ? displayTime(value) : ""}
        placeholder="Select a time"
        helperText={helperText}
        kind="time"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <Sheet onClose={close}>
          <SheetHeader title={label} value={displayTime(timeValue(hour, minute))} onClose={close} />
          <View style={styles.timeDisplay}>
            <Text style={styles.timeDisplayNumber}>{hour % 12 || 12}</Text>
            <Text style={styles.timeDisplayColon}>:</Text>
            <Text style={styles.timeDisplayNumber}>{pad(minute)}</Text>
            <Text style={styles.timeDisplayMeridiem}>{hour >= 12 ? "PM" : "AM"}</Text>
          </View>
          <Text style={styles.optionLabel}>Hour</Text>
          <ScrollView style={styles.hoursScroller} contentContainerStyle={styles.hoursGrid} showsVerticalScrollIndicator={false}>
            {HOURS.map((option) => {
              const selected = option === hour
              const unavailable = MINUTES.every((optionMinute) =>
                timeOutOfRange(option, optionMinute, min, minExclusive)
              )
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: unavailable }}
                  disabled={unavailable}
                  onPress={() => setHour(option)}
                  style={({ pressed }) => [
                    styles.hourOption,
                    selected && styles.optionSelected,
                    pressed && !selected && !unavailable && styles.optionPressed,
                    unavailable && styles.optionDisabled,
                  ]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected, unavailable && styles.optionTextDisabled]}>
                    {hourLabel(option)}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
          <Text style={styles.optionLabel}>Minutes</Text>
          <View style={styles.minutesRow}>
            {MINUTES.map((option) => {
              const selected = option === minute
              const unavailable = timeOutOfRange(hour, option, min, minExclusive)
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: unavailable }}
                  disabled={unavailable}
                  onPress={() => setMinute(option)}
                  style={({ pressed }) => [
                    styles.minuteOption,
                    selected && styles.optionSelected,
                    pressed && !selected && !unavailable && styles.optionPressed,
                    unavailable && styles.optionDisabled,
                  ]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected, unavailable && styles.optionTextDisabled]}>
                    {pad(option)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <SheetActions
            alternateLabel="Now"
            onAlternate={selectCurrentTime}
            onConfirm={() => {
              if (draftInvalid) return
              onChange(timeValue(hour, minute))
              close()
            }}
          />
        </Sheet>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  fieldLabel: { color: c.text, fontSize: 14, fontWeight: "700", marginBottom: spacing.xs },
  fieldButton: {
    alignItems: "center",
    backgroundColor: c.bgContainer,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 62,
    paddingHorizontal: spacing.sm,
  },
  fieldButtonPressed: { backgroundColor: c.primaryBg, borderColor: c.primaryHover },
  fieldIcon: {
    alignItems: "center",
    borderColor: c.primaryActive,
    borderRadius: radii.xs,
    borderWidth: 1.5,
    height: 30,
    justifyContent: "center",
    marginRight: spacing.sm,
    overflow: "hidden",
    width: 30,
  },
  fieldIconTop: { backgroundColor: c.primary, height: 7, left: 0, position: "absolute", right: 0, top: 0 },
  fieldIconDots: { flexDirection: "row", gap: 3, marginTop: 5 },
  fieldIconDot: { backgroundColor: c.primaryActive, borderRadius: 3, height: 3, width: 3 },
  timeIcon: { borderRadius: 999 },
  clockHandShort: { backgroundColor: c.primaryActive, borderRadius: 2, height: 8, position: "absolute", top: 6, width: 2 },
  clockHandLong: { backgroundColor: c.primaryActive, borderRadius: 2, height: 10, position: "absolute", right: 8, top: 13, transform: [{ rotate: "-45deg" }], width: 2 },
  fieldCopy: { flex: 1 },
  fieldValue: { color: c.text, fontSize: 16, fontWeight: "600" },
  fieldPlaceholder: { color: c.textTertiary, fontWeight: "400" },
  helperText: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
  fieldChevron: { marginLeft: spacing.xs },
  chevronIcon: {
    borderBottomWidth: 2,
    borderColor: c.primaryActive,
    borderRightWidth: 2,
    height: 10,
    transform: [{ rotate: "-45deg" }],
    width: 10,
  },
  chevronIconLeft: { transform: [{ rotate: "135deg" }] },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(31, 31, 31, 0.45)" },
  sheet: {
    backgroundColor: c.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sheetHandle: { alignSelf: "center", backgroundColor: c.fill, borderRadius: 2, height: 4, marginBottom: spacing.sm, marginTop: spacing.sm, width: 42 },
  sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  sheetEyebrow: { color: c.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 2 },
  sheetTitle: { color: c.text, fontSize: 22, fontWeight: "800" },
  closeButton: { alignItems: "center", backgroundColor: c.fillSecondary, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  closeButtonLabel: { color: c.textSecondary, fontSize: 27, fontWeight: "300", lineHeight: 29 },
  monthControls: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  monthButton: { alignItems: "center", backgroundColor: c.primaryBg, borderRadius: radii.sm, height: 36, justifyContent: "center", width: 36 },
  monthLabel: { color: c.text, fontSize: 16, fontWeight: "700" },
  weekdayRow: { flexDirection: "row", marginBottom: 2 },
  weekday: { color: c.textTertiary, flex: 1, fontSize: 11, fontWeight: "700", textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  day: { alignItems: "center", aspectRatio: 1, justifyContent: "center", padding: 3, width: "14.2857%" },
  daySelected: { backgroundColor: c.primaryActive, borderRadius: 999 },
  dayPressed: { backgroundColor: c.primaryBg, borderRadius: 999 },
  dayDisabled: { opacity: 0.35 },
  dayLabel: { color: c.text, fontSize: 15, fontWeight: "600" },
  dayOutsideMonth: { color: c.textTertiary, fontWeight: "400" },
  dayToday: { color: c.primaryActive, fontWeight: "800" },
  dayLabelSelected: { color: c.bgContainer, fontWeight: "800" },
  dayLabelDisabled: { color: c.textTertiary, fontWeight: "400" },
  timeDisplay: { alignItems: "baseline", flexDirection: "row", justifyContent: "center", marginBottom: spacing.md },
  timeDisplayNumber: { color: c.primaryActive, fontSize: 42, fontVariant: ["tabular-nums"], fontWeight: "800", letterSpacing: -1 },
  timeDisplayColon: { color: c.textTertiary, fontSize: 38, fontWeight: "600", marginHorizontal: 3 },
  timeDisplayMeridiem: { color: c.textSecondary, fontSize: 15, fontWeight: "800", marginLeft: spacing.xs },
  optionLabel: { color: c.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginBottom: spacing.xs, textTransform: "uppercase" },
  hoursScroller: { maxHeight: 164, marginBottom: spacing.md },
  hoursGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  hourOption: { alignItems: "center", backgroundColor: c.fillSecondary, borderColor: c.fillSecondary, borderRadius: radii.sm, borderWidth: 1, flexBasis: "31%", flexGrow: 1, justifyContent: "center", minHeight: 42 },
  minutesRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  minuteOption: { alignItems: "center", backgroundColor: c.fillSecondary, borderColor: c.fillSecondary, borderRadius: radii.sm, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 42 },
  optionSelected: { backgroundColor: c.primaryBg, borderColor: c.primaryActive },
  optionPressed: { borderColor: c.primaryHover },
  optionDisabled: { opacity: 0.4 },
  optionText: { color: c.textSecondary, fontSize: 14, fontWeight: "700" },
  optionTextSelected: { color: c.primaryText },
  optionTextDisabled: { color: c.textTertiary },
  actions: { alignItems: "center", borderTopColor: c.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs, paddingTop: spacing.sm },
  textAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  textActionLabel: { color: c.primaryActive, fontSize: 15, fontWeight: "800" },
  confirmButton: { alignItems: "center", backgroundColor: c.primary, borderRadius: radii.sm, justifyContent: "center", minHeight: 44, minWidth: 96, paddingHorizontal: spacing.md },
  confirmButtonLabel: { color: c.primaryText, fontSize: 15, fontWeight: "800" },
})
