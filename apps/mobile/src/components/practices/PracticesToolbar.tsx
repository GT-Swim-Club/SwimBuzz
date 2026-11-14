import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Pressable, StyleSheet, TextInput, View } from "react-native"
import type { IconName } from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"
import { useThemePreference } from "../../lib/theme"
import { Icon } from "../Icon"

/**
 * One row of square icon buttons, like the web practices sidebar's toolbar:
 * Search and Select on the left; Tags, view settings and New practice on the right.
 * Search swaps the row for a search field with a back button.
 */
export function PracticesToolbar({
  query,
  onQueryChange,
  showSelect,
  selecting,
  onSelectingChange,
  tagsButton,
  onOpenSettings,
  newLabel,
  onNew,
}: {
  query: string
  onQueryChange: (value: string) => void
  /** Hidden in Trash, which has no select mode (same as web). */
  showSelect: boolean
  selecting: boolean
  onSelectingChange: (selecting: boolean) => void
  /** The tag filter, rendered with a ToolbarButton trigger. */
  tagsButton: ReactNode
  onOpenSettings: () => void
  newLabel: string
  onNew: () => void
}) {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const styles = useMemo(() => makeStyles(c), [c])
  const [searchOpen, setSearchOpen] = useState(Boolean(query))
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  function closeSearch() {
    setSearchOpen(false)
    if (query.trim()) onQueryChange("")
  }

  if (searchOpen) {
    return (
      <View style={styles.row}>
        <ToolbarButton icon="arrowLeft" label="Exit search" onPress={closeSearch} />
        <View style={styles.searchWrap}>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search practices…"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            keyboardAppearance={colorScheme}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => {
                onQueryChange("")
                inputRef.current?.focus()
              }}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <Icon name="x" size={16} color={c.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.row}>
      <ToolbarButton
        icon="search"
        label="Search practices"
        dot={Boolean(query)}
        onPress={() => setSearchOpen(true)}
      />
      {showSelect ? (
        <ToolbarButton
          icon="select"
          label={selecting ? "Done selecting" : "Select practices"}
          active={selecting}
          onPress={() => onSelectingChange(!selecting)}
        />
      ) : null}
      <View style={styles.right}>
        {tagsButton}
        <ToolbarButton icon="settings" label="View settings" onPress={onOpenSettings} />
        <ToolbarButton icon="plus" label={newLabel} variant="primary" onPress={onNew} />
      </View>
    </View>
  )
}

/** A 40×40 bordered square icon button — web's toolbar `controlClass`. */
export function ToolbarButton({
  icon,
  label,
  onPress,
  active = false,
  dot = false,
  variant = "default",
}: {
  icon: IconName
  label: string
  onPress: () => void
  /** Highlighted (gold border and wash), e.g. select mode on or tags filtered. */
  active?: boolean
  /** A small gold dot, e.g. a search query is applied. */
  dot?: boolean
  variant?: "default" | "primary"
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const primary = variant === "primary"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active ? { selected: true } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && styles.buttonActive,
        primary && styles.buttonPrimary,
        pressed && (primary ? styles.buttonPrimaryPressed : styles.pressed),
      ]}
    >
      <Icon
        name={icon}
        size={18}
        color={primary ? c.primaryContrast : active ? c.accent : c.text}
      />
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    row: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
    right: { alignItems: "center", flexDirection: "row", gap: spacing.xs, marginLeft: "auto" },
    button: {
      alignItems: "center",
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: radii.md,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    buttonActive: { backgroundColor: c.primaryBg, borderColor: c.primary },
    buttonPrimary: { backgroundColor: c.primary, borderColor: c.primary },
    buttonPrimaryPressed: { backgroundColor: c.primaryHover, borderColor: c.primaryHover },
    pressed: { backgroundColor: c.bgHover },
    dot: {
      backgroundColor: c.primary,
      borderRadius: 3,
      height: 6,
      position: "absolute",
      right: 6,
      top: 6,
      width: 6,
    },
    searchWrap: { flex: 1, justifyContent: "center", minWidth: 0 },
    searchInput: {
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: radii.md,
      borderWidth: 1,
      color: c.text,
      fontSize: 15,
      height: 40,
      paddingLeft: spacing.sm,
      paddingRight: 40,
    },
    clear: {
      alignItems: "center",
      borderRadius: radii.sm,
      height: 28,
      justifyContent: "center",
      position: "absolute",
      right: 6,
      width: 28,
    },
  })
}
