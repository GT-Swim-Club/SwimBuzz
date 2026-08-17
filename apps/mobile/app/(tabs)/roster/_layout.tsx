import { TabChromeStack } from "../../../src/components/TabChromeStack"

export const unstable_settings = {
  initialRouteName: "index",
}

export default function RosterStackLayout() {
  return (
    <TabChromeStack
      backScreens={[
        { name: "[id]", fallbackHref: "/roster" },
        { name: "new", fallbackHref: "/roster" },
      ]}
    />
  )
}
