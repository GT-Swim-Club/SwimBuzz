import type { ReactNode } from "react"
import { Pressable, Text, View } from "react-native"
import { radii, spacing } from "@swimbuzz/tokens"
import { SubtitleSegments, usePalette } from "@swimbuzz/ui"

export function GalleryTile({
  title,
  titleAdornment,
  subtitle,
  subtitleSegments,
  onPress,
}: {
  title: string
  /** Rendered as a sibling right after the title (e.g. a staff badge icon) — never nested inside the title Text. */
  titleAdornment?: ReactNode
  subtitle?: string
  /** " · "-joined segments (string or node) — for a subtitle containing a pressable element. Takes precedence over `subtitle`. */
  subtitleSegments?: ReactNode[]
  onPress?: () => void
}) {
  const c = usePalette()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 96,
        marginBottom: spacing.sm,
        marginHorizontal: spacing.xxs,
        padding: spacing.sm,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.bgContainer,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {titleAdornment ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text
            numberOfLines={2}
            style={{ color: c.text, fontSize: 15, fontWeight: "700", flexShrink: 1 }}
          >
            {title}
          </Text>
          {titleAdornment}
        </View>
      ) : (
        <Text
          numberOfLines={2}
          style={{ color: c.text, fontSize: 15, fontWeight: "700" }}
        >
          {title}
        </Text>
      )}
      {subtitleSegments ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
          <SubtitleSegments
            segments={subtitleSegments}
            textStyle={{ color: c.textSecondary, fontSize: 12, lineHeight: 16 }}
          />
        </View>
      ) : subtitle ? (
        <Text
          numberOfLines={3}
          style={{
            color: c.textSecondary,
            fontSize: 12,
            lineHeight: 16,
            marginTop: 4,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {onPress ? (
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Text style={{ color: c.textTertiary, fontSize: 20, fontWeight: "300" }}>
            ›
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
