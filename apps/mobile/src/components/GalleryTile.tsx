import { Pressable, Text, View } from "react-native"
import { radii, spacing } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"

export function GalleryTile({
  title,
  subtitle,
  onPress,
}: {
  title: string
  subtitle?: string
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
      <Text
        numberOfLines={2}
        style={{ color: c.text, fontSize: 15, fontWeight: "700" }}
      >
        {title}
      </Text>
      {subtitle ? (
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
