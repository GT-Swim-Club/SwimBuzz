import { Stack, type Href } from "expo-router"
import { HeaderBrand, useAppHeaderOptions } from "./AppHeader"
import { ScreenBackButton } from "./ScreenBackButton"

export function PushedChromeStack({ fallbackHref }: { fallbackHref?: Href } = {}) {
  const appHeaderOptions = useAppHeaderOptions()
  return (
    <Stack
      screenOptions={{
        ...appHeaderOptions,
        headerShown: true,
        headerBackVisible: false,
        headerLeft: () => <ScreenBackButton fallbackHref={fallbackHref} />,
        headerTitle: () => <HeaderBrand />,
      }}
    />
  )
}
