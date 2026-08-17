import { Stack, type Href } from "expo-router"
import { UnreadAlertsChrome, useTabChromeHeaderOptions } from "./AppHeader"
import { ScreenBackButton } from "./ScreenBackButton"

export function TabChromeStack({
  backScreens = [],
}: {
  backScreens?: { name: string; fallbackHref: Href }[]
}) {
  const screenOptions = useTabChromeHeaderOptions()
  return (
    <UnreadAlertsChrome>
      <Stack initialRouteName="index" screenOptions={screenOptions}>
        <Stack.Screen
          name="index"
          options={{ headerBackVisible: false, headerLeft: () => null }}
        />
        {backScreens.map((screen) => (
          <Stack.Screen
            key={screen.name}
            name={screen.name}
            options={{
              headerLeft: () => <ScreenBackButton fallbackHref={screen.fallbackHref} />,
            }}
          />
        ))}
      </Stack>
    </UnreadAlertsChrome>
  )
}
