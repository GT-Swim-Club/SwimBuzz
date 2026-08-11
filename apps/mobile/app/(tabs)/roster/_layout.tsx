import { Stack } from "expo-router"
import { colors } from "@swimbuzz/tokens"

export default function RosterStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.light.primaryBg },
        headerTintColor: colors.light.primaryText,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Roster" }} />
      <Stack.Screen name="new" options={{ title: "Add athlete" }} />
      <Stack.Screen name="[id]" options={{ title: "Athlete" }} />
    </Stack>
  )
}
