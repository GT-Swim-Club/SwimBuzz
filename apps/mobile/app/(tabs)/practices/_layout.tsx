import { Stack } from "expo-router"
import { colors } from "@swimbuzz/tokens"

export default function PracticesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.light.primaryBg },
        headerTintColor: colors.light.primaryText,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Practices" }} />
      <Stack.Screen name="new" options={{ title: "New practice" }} />
      <Stack.Screen name="[id]" options={{ title: "Practice" }} />
    </Stack>
  )
}
