import { Stack } from "expo-router"
import { HeaderBrand, useAppHeaderOptions } from "../../src/components/AppHeader"
import { ScreenBackButton } from "../../src/components/ScreenBackButton"

export default function AuthLayout() {
  const appHeaderOptions = useAppHeaderOptions()
  return (
    <Stack
      screenOptions={{
        ...appHeaderOptions,
        headerBackVisible: false,
        headerLeft: () => <ScreenBackButton fallbackHref="/welcome" />,
        headerTitle: () => <HeaderBrand />,
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
    </Stack>
  )
}
