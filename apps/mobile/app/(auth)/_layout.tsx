import { Stack } from "expo-router"
import { colors } from "@swimbuzz/tokens"

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.light.primaryBg },
        headerTintColor: colors.light.primaryText,
        contentStyle: { backgroundColor: colors.light.bgLayout },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
    </Stack>
  )
}
