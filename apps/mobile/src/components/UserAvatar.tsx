import { Image, StyleSheet, Text, View } from "react-native"
import { usePalette } from "@swimbuzz/ui"

export function initialsFromName(name?: string | null, email?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  const local = (email ?? "").split("@")[0]
  return (local.slice(0, 2) || "?").toUpperCase()
}

export function UserAvatar({
  image,
  name,
  email,
  size = 40,
}: {
  image?: string | null
  name?: string | null
  email?: string | null
  size?: number
}) {
  const initials = initialsFromName(name, email)
  const c = usePalette()
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: c.primaryBg,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      {image ? (
        <Image source={{ uri: image }} style={{ height: size, width: size }} />
      ) : (
        <Text style={[styles.initials, { color: c.primaryActive, fontSize: Math.max(10, size * 0.36) }]}>
          {initials}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: { fontWeight: "700" },
})
