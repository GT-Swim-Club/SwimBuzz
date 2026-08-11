import { Stack } from "expo-router"
import { colors } from "@swimbuzz/tokens"

export default function MeetsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.light.primaryBg },
        headerTintColor: colors.light.primaryText,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Meets" }} />
      <Stack.Screen name="new" options={{ title: "New meet" }} />
      <Stack.Screen name="[id]" options={{ title: "Meet" }} />
    </Stack>
  )
}
