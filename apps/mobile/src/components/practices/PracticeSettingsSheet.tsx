import { useMemo, type ReactNode } from "react"
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native"
import type { IconName, PracticeScope } from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { BottomSheet, usePalette } from "@swimbuzz/ui"
import type {
  DefaultPracticesView,
  PracticeCardLabel,
  PracticePrefsApi,
  PracticeSort,
} from "../../lib/view-preferences"
import { Icon } from "../Icon"

const VIEWS: Array<{ value: DefaultPracticesView; label: string; icon: IconName }> = [
  { value: "week", label: "Week", icon: "calendarWeek" },
  { value: "month", label: "Month", icon: "calendarMonth" },
  { value: "list", label: "List", icon: "list" },
  { value: "deleted", label: "Trash", icon: "trash" },
]

const SCOPES: Array<{ value: PracticeScope; label: string }> = [
  { value: "all", label: "All practices" },
  { value: "team", label: "Team" },
  { value: "mine", label: "Mine (private)" },
]

const CARD_LABELS: Array<{ value: PracticeCardLabel; label: string; icon: IconName }> = [
  { value: "time", label: "Time", icon: "clock" },
  { value: "tags", label: "Tags", icon: "tag" },
]

const SORTS: Array<{ value: PracticeSort; label: string }> = [
  { value: "date-desc", label: "Date (newest first)" },
  { value: "date-asc", label: "Date (oldest first)" },
  { value: "yards-desc", label: "Distance (longest first)" },
  { value: "yards-asc", label: "Distance (shortest first)" },
]

/**
 * The Practices tab's view settings — the web sidebar's gear popover as a bottom sheet:
 * view, scope, what a row shows under its title, and Mon–Thu (week) or sort (list, Trash).
 * Picking an option closes the sheet, like web; the Mon–Thu switch leaves it open.
 */
export function PracticeSettingsSheet({
  visible,
  onClose,
  prefs,
  isStaff,
}: {
  visible: boolean
  onClose: () => void
  prefs: PracticePrefsApi
  isStaff: boolean
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const views = isStaff ? VIEWS : VIEWS.filter((view) => view.value !== "deleted")
  const browsing = prefs.view !== "deleted"

  function pick(apply: () => void) {
    apply()
    onClose()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="View settings">
      <ScrollView style={styles.scroll} bounces={false}>
        <Group>
          {views.map((view) => (
            <OptionRow
              key={view.value}
              icon={view.icon}
              label={view.label}
              selected={prefs.view === view.value}
              onPress={() => pick(() => prefs.setView(view.value))}
            />
          ))}
        </Group>

        {browsing ? (
          <Group divided>
            {SCOPES.map((scope) => (
              <OptionRow
                key={scope.value}
                label={scope.label}
                selected={prefs.scope === scope.value}
                onPress={() => pick(() => prefs.setScope(scope.value))}
              />
            ))}
          </Group>
        ) : null}

        {browsing ? (
          <Group divided>
            {CARD_LABELS.map((option) => (
              <OptionRow
                key={option.value}
                icon={option.icon}
                label={option.label}
                selected={prefs.cardLabel === option.value}
                onPress={() => pick(() => prefs.setCardLabel(option.value))}
              />
            ))}
          </Group>
        ) : null}

        {prefs.view === "week" ? (
          <Group divided>
            <View style={styles.row}>
              <Icon name="calendarWeek" size={18} color={c.text} />
              <Text style={styles.label}>Mon–Thu</Text>
              <Switch
                accessibilityLabel="Show Monday to Thursday only"
                value={prefs.monThuOnly}
                onValueChange={prefs.setMonThuOnly}
                trackColor={{ false: c.switchTrack, true: c.primary }}
                thumbColor={c.switchThumb}
              />
            </View>
          </Group>
        ) : prefs.view === "list" || prefs.view === "deleted" ? (
          <Group divided title="Sort by">
            {(prefs.view === "deleted" ? SORTS.slice(0, 2) : SORTS).map((sort) => (
              <OptionRow
                key={sort.value}
                label={sort.label}
                selected={prefs.sort === sort.value}
                onPress={() => pick(() => prefs.setSort(sort.value))}
              />
            ))}
          </Group>
        ) : null}
      </ScrollView>
    </BottomSheet>
  )
}

function Group({
  children,
  divided = false,
  title,
}: {
  children: ReactNode
  divided?: boolean
  title?: string
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  return (
    <View style={divided ? styles.groupDivided : undefined}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      {children}
    </View>
  )
}

function OptionRow({
  icon,
  label,
  selected,
  onPress,
}: {
  icon?: IconName
  label: string
  selected: boolean
  onPress: () => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const color = selected ? c.accent : c.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? <Icon name={icon} size={18} color={color} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
      {selected ? <Icon name="check" size={18} color={c.accent} /> : null}
    </Pressable>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { maxHeight: 520 },
    groupDivided: {
      borderTopColor: c.borderSecondary,
      borderTopWidth: StyleSheet.hairlineWidth,
      marginTop: spacing.xxs,
      paddingTop: spacing.xxs,
    },
    groupTitle: {
      color: c.textTertiary,
      fontSize: 12,
      fontWeight: "600",
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.xs,
      textTransform: "uppercase",
    },
    row: {
      alignItems: "center",
      borderRadius: radii.md,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.xs,
    },
    pressed: { backgroundColor: c.bgHover },
    label: { color: c.text, flex: 1, fontSize: 16 },
  })
}
