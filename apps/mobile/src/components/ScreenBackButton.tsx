import { useRouter, type Href } from "expo-router"
import { Pressable, StyleSheet } from "react-native"
import { usePalette } from "@swimbuzz/ui"
import { Icon } from "./Icon"

const SIZE = 36

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    height: SIZE,
    justifyContent: "center",
    width: SIZE,
  },
  pressed: { opacity: 0.72 },
})

export function ScreenBackButton({
  label = "Back",
  fallbackHref,
}: {
  label?: string
  fallbackHref?: Href
}) {
  const router = useRouter()
  const c = usePalette()

  function onPress() {
    if (router.canGoBack()) {
      router.back()
      return
    }
    if (fallbackHref) router.replace(fallbackHref)
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      <Icon color={c.text} name="chevronLeft" size={20} />
    </Pressable>
  )
}
