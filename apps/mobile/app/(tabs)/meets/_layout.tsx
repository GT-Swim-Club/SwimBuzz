import { TabChromeStack } from "../../../src/components/TabChromeStack"

export const unstable_settings = {
  initialRouteName: "index",
}

export default function MeetsStackLayout() {
  return (
    <TabChromeStack
      backScreens={[
        { name: "[id]", fallbackHref: "/meets" },
        { name: "new", fallbackHref: "/meets" },
      ]}
    />
  )
}
