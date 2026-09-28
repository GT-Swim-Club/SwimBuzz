import { Pressable, View } from "react-native"
import { usePalette } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { Icon } from "./Icon"

/** A small undo/redo pair backed by an in-memory history stack (see useUndoableState) —
 * no server or storage persistence, so the stack starts empty each time the screen mounts. */
export function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const c = usePalette()
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <Pressable
        onPress={onUndo}
        disabled={!canUndo}
        accessibilityRole="button"
        accessibilityLabel="Undo"
        hitSlop={8}
        style={{ opacity: canUndo ? 1 : 0.35, paddingVertical: spacing.xxs, paddingHorizontal: spacing.xs }}
      >
        <Icon name="rotateCcw" size={20} color={c.text} />
      </Pressable>
      <Pressable
        onPress={onRedo}
        disabled={!canRedo}
        accessibilityRole="button"
        accessibilityLabel="Redo"
        hitSlop={8}
        style={{ opacity: canRedo ? 1 : 0.35, paddingVertical: spacing.xxs, paddingHorizontal: spacing.xs }}
      >
        <Icon name="rotateCw" size={20} color={c.text} />
      </Pressable>
    </View>
  )
}
