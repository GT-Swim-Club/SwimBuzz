import { useMemo, useState, type ReactNode } from "react"
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"
import { api } from "../lib/api"
import { useThemePreference } from "../lib/theme"
import { Icon } from "./Icon"

const TAG_NAME_MAX_LENGTH = 10
const TAG_MAX_COUNT = 20

export type PracticeTag = { id: string; name: string }

export function PracticeTagFilter({
  tags,
  selected,
  canManage,
  onChangeTags,
  onChangeSelected,
}: {
  tags: PracticeTag[]
  selected: string[]
  canManage: boolean
  onChangeTags: (tags: PracticeTag[]) => void
  onChangeSelected: (tags: string[]) => void
}) {
  const c = usePalette()
  const insets = useSafeAreaInsets()
  const { colorScheme } = useThemePreference()
  const brandColor = colorScheme === "dark" ? c.primaryHover : c.primaryActive
  const styles = useMemo(() => makeStyles(c), [c])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const noneSelected = selected.length === 0
  const triggerLabel = noneSelected ? "All tags" : selected.join(", ")
  const glass = isLiquidGlassAvailable()

  function close() {
    Keyboard.dismiss()
    setDraft("")
    setOpen(false)
  }

  function toggle(name: string) {
    onChangeSelected(
      selected.includes(name)
        ? selected.filter((tag) => tag !== name)
        : [...selected, name]
    )
  }

  async function saveDraft() {
    const name = draft.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const created = await api.createPracticeTag(name)
      onChangeTags(
        [...tags, created].sort((a, b) => a.name.localeCompare(b.name))
      )
      setDraft("")
    } catch (error) {
      Alert.alert(
        "Could not add tag",
        error instanceof Error ? error.message : "Unable to save tag"
      )
    } finally {
      setSaving(false)
    }
  }

  function requestRemoval(tag: PracticeTag) {
    Alert.alert(
      "Remove shared tag",
      `Remove ${tag.name} from the shared practice tags? This will also remove it from practices that currently use it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove tag",
          style: "destructive",
          onPress: () => {
            void removeTag(tag)
          },
        },
      ]
    )
  }

  async function removeTag(tag: PracticeTag) {
    if (saving) return
    setSaving(true)
    try {
      await api.deletePracticeTag(tag.id)
      onChangeTags(tags.filter((item) => item.id !== tag.id))
      onChangeSelected(selected.filter((name) => name !== tag.name))
    } catch (error) {
      Alert.alert(
        "Could not remove tag",
        error instanceof Error ? error.message : "Unable to remove tag"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.triggerWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Filter by tags, ${triggerLabel}`}
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <Text
          numberOfLines={1}
          style={[styles.triggerLabel, noneSelected && styles.triggerPlaceholder]}
        >
          {triggerLabel}
        </Text>
        <Icon color={brandColor} name="chevronRight" size={16} />
      </Pressable>
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        visible={open}
      >
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <View style={styles.sheetHeader}>
            <GlassView
              colorScheme={colorScheme}
              glassEffectStyle="regular"
              isInteractive
              tintColor={c.fill}
              style={[styles.doneBtn, !glass && styles.doneBtnFallback]}
            >
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                hitSlop={8}
                onPress={close}
                style={styles.doneHit}
              >
                <Icon color={c.text} name="check" size={22} strokeWidth={2.4} />
              </Pressable>
            </GlassView>
            <Text pointerEvents="none" style={styles.sheetTitle}>
              Tags
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.group}>
              <TagRow
                label="All"
                selected={noneSelected}
                onPress={() => onChangeSelected([])}
              />
              {tags.map((tag) => {
                const selectedTag = selected.includes(tag.name)
                return (
                  <View key={tag.id}>
                    <View style={styles.divider} />
                    <TagRow
                      label={tag.name}
                      selected={selectedTag}
                      onPress={() => toggle(tag.name)}
                      trailing={
                        canManage ? (
                          <Pressable
                            accessibilityLabel={`Remove ${tag.name}`}
                            disabled={saving}
                            hitSlop={6}
                            onPress={() => requestRemoval(tag)}
                            style={styles.remove}
                          >
                            <Icon color={c.textTertiary} name="x" size={12} />
                          </Pressable>
                        ) : undefined
                      }
                    />
                  </View>
                )
              })}
              {canManage && tags.length < TAG_MAX_COUNT ? (
                <View>
                  <View style={styles.divider} />
                  <View style={styles.draftRow}>
                    <TextInput
                      editable={!saving}
                      maxLength={TAG_NAME_MAX_LENGTH}
                      onChangeText={setDraft}
                      onSubmitEditing={() => void saveDraft()}
                      placeholder="New tag"
                      placeholderTextColor={c.textTertiary}
                      returnKeyType="done"
                      style={styles.draftInput}
                      value={draft}
                    />
                    <Pressable
                      accessibilityLabel="Save new practice tag"
                      disabled={saving || !draft.trim()}
                      onPress={() => void saveDraft()}
                      style={[
                        styles.draftSave,
                        (!draft.trim() || saving) && styles.draftDisabled,
                      ]}
                    >
                      <Icon color={c.primaryText} name="check" size={12} strokeWidth={2.8} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function TagRow({
  label,
  selected,
  onPress,
  trailing,
}: {
  label: string
  selected: boolean
  onPress: () => void
  trailing?: ReactNode
}) {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const brandColor = colorScheme === "dark" ? c.primaryHover : c.primaryActive
  const styles = useMemo(() => makeStyles(c), [c])
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.row}
    >
      <View
        style={[
          styles.dot,
          selected
            ? { backgroundColor: brandColor }
            : { borderColor: c.border, borderWidth: 1.5 },
        ]}
      >
        {selected ? (
          <Icon color={c.primaryText} name="check" size={11} strokeWidth={3} />
        ) : null}
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {trailing}
    </Pressable>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    triggerWrap: {
      flex: 1,
    },
    trigger: {
      alignItems: "center",
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      height: 44,
      justifyContent: "space-between",
      paddingHorizontal: 12,
    },
    triggerLabel: {
      color: c.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
    },
    triggerPlaceholder: {
      color: c.textTertiary,
      fontWeight: "500",
    },
    sheet: {
      backgroundColor: c.bgLayout,
      flex: 1,
    },
    sheetHeader: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 80,
      paddingBottom: 20,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    doneBtn: {
      borderRadius: 22,
      height: 44,
      position: "absolute",
      right: 16,
      top: 16,
      width: 44,
    },
    doneHit: {
      alignItems: "center",
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    doneBtnFallback: {
      backgroundColor: c.fill,
    },
    sheetTitle: {
      color: c.text,
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    },
    list: {
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    group: {
      backgroundColor: c.bgElevated,
      borderRadius: 16,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    dot: {
      alignItems: "center",
      borderRadius: 9,
      height: 18,
      justifyContent: "center",
      width: 18,
    },
    rowLabel: {
      color: c.text,
      flex: 1,
      fontSize: 15,
      fontWeight: "500",
    },
    divider: {
      backgroundColor: c.border,
      height: StyleSheet.hairlineWidth,
      marginLeft: 40,
    },
    remove: {
      alignItems: "center",
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    draftRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    draftInput: {
      color: c.text,
      flex: 1,
      fontSize: 15,
      paddingVertical: 6,
    },
    draftSave: {
      alignItems: "center",
      backgroundColor: c.primary,
      borderRadius: 9,
      height: 18,
      justifyContent: "center",
      width: 18,
    },
    draftDisabled: {
      opacity: 0.4,
    },
  })
}
