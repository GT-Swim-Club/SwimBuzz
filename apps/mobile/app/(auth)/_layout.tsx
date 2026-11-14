import { Stack } from "expo-router"
import { HeaderBrand, useAppHeaderOptions } from "../../src/components/AppHeader"

export default function AuthLayout() {
  const appHeaderOptions = useAppHeaderOptions()
  return (
    <Stack
      screenOptions={{
        ...appHeaderOptions,
        // Sign-in is the signed-out entry point, so there is nothing to go back to.
        headerBackVisible: false,
        headerLeft: () => null,
        headerTitle: () => <HeaderBrand />,
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
    </Stack>
  )
}
