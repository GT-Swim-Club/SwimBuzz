import { Stack } from "expo-router"
import { colors } from "@swimbuzz/tokens"

export default function NationalsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.light.primaryBg },
        headerTintColor: colors.light.primaryText,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Nationals" }} />
    </Stack>
  )
}
