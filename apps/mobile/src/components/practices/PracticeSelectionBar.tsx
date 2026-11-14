import { useMemo, useState } from "react"
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import * as Sharing from "expo-sharing"
import { File, Paths } from "expo-file-system"
import type { PracticeSummary } from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { Button, usePalette } from "@swimbuzz/ui"
import { api, API_URL, getAccessToken } from "../../lib/api"

/** Native tab bar height excluding the home indicator — matches lib/tab-bar.ts. */
const NATIVE_TAB_BAR_HEIGHT = Platform.OS === "android" ? 56 : 49
/** Room the bar takes, so the list can scroll its last rows clear of it. */
export const SELECTION_BAR_SPACE = 132

function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/)
  return match?.[1] ?? "practices.pdf"
}

/**
 * Select mode's action bar, like the web sidebar's PracticeSelectionBar: the count,
 * Select all / Cancel, then Share PDF (one combined PDF, oldest first) and
 * Move to Trash ("Delete" when every selected practice is private).
 */
export function PracticeSelectionBar({
  selected,
  canDelete,
  allVisibleSelected,
  canSelectAll,
  bottomInset,
  onToggleAll,
  onCancel,
  onExported,
  onDeleted,
}: {
  selected: PracticeSummary[]
  canDelete: boolean
  allVisibleSelected: boolean
  canSelectAll: boolean
  /** The safe-area bottom inset; the bar floats just above the tab bar. */
  bottomInset: number
  onToggleAll: () => void
  onCancel: () => void
  onExported: () => void
  /** After a bulk delete, with what was moved and what was skipped. */
  onDeleted: (result: { deletedIds: string[]; skipped: Array<{ id: string; reason: string }> }) => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const [busy, setBusy] = useState<"pdf" | "delete" | null>(null)
  const count = selected.length
  const allPrivate = count > 0 && selected.every((p) => p.visibility === "PRIVATE")
  const deleteLabel = allPrivate ? "Delete" : "Move to Trash"

  async function sharePdf() {
    setBusy("pdf")
    try {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/api/practices/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: selected.map((p) => p.id) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Could not create PDF")
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      const file = new File(Paths.cache, filenameFromDisposition(res.headers.get("content-disposition")))
      if (file.exists) file.delete()
      file.write(bytes)
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
      onExported()
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  async function deleteSelected() {
    setBusy("delete")
    try {
      const result = await api.deletePractices(selected.map((p) => p.id))
      if (result.skipped.length > 0) {
        const n = result.skipped.length
        Alert.alert(
          `${n} practice${n === 1 ? " was" : "s were"} not deleted`,
          "They're being edited, or aren't yours to delete."
        )
      }
      onDeleted(result)
    } catch (err) {
      Alert.alert("Could not delete", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  function confirmDelete() {
    const noun = `${count} practice${count === 1 ? "" : "s"}`
    Alert.alert(
      allPrivate ? `Delete ${noun}?` : `Move ${noun} to Trash?`,
      allPrivate
        ? "Private practices are deleted permanently. This can't be undone."
        : "Coaches can restore them from Trash. Private practices among them are deleted permanently.",
      [
        { text: "Cancel", style: "cancel" },
        { text: deleteLabel, style: "destructive", onPress: () => void deleteSelected() },
      ]
    )
  }

  return (
    <View style={[styles.bar, { bottom: NATIVE_TAB_BAR_HEIGHT + bottomInset + spacing.xs }]}>
      <View style={styles.topRow}>
        <Text style={styles.count}>
          {count === 0 ? "Select practices" : `${count} selected`}
        </Text>
        <View style={styles.links}>
          {canSelectAll ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onToggleAll}>
              <Text style={styles.link}>{allVisibleSelected ? "Deselect all" : "Select all"}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label="Share PDF"
            variant="secondary"
            loading={busy === "pdf"}
            disabled={count === 0 || busy != null}
            onPress={() => void sharePdf()}
          />
        </View>
        {canDelete ? (
          <View style={styles.action}>
            <Button
              label={deleteLabel}
              variant="danger"
              loading={busy === "delete"}
              disabled={count === 0 || busy != null}
              onPress={confirmDelete}
            />
          </View>
        ) : null}
      </View>
    </View>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    bar: {
      backgroundColor: c.bgElevated,
      borderColor: c.borderSecondary,
      borderRadius: 14,
      borderWidth: 1,
      gap: spacing.sm,
      left: spacing.md,
      padding: spacing.sm,
      position: "absolute",
      right: spacing.md,
    },
    topRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    count: { color: c.text, fontSize: 15, fontWeight: "700" },
    links: { alignItems: "center", flexDirection: "row", gap: spacing.md },
    link: { color: c.accent, fontSize: 14, fontWeight: "600" },
    cancel: { color: c.textSecondary, fontSize: 14, fontWeight: "600" },
    actions: { flexDirection: "row", gap: spacing.xs },
    action: { flex: 1 },
  })
}
