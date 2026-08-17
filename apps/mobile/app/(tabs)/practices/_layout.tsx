import { TabChromeStack } from "../../../src/components/TabChromeStack"

export const unstable_settings = {
  initialRouteName: "index",
}

export default function PracticesStackLayout() {
  return (
    <TabChromeStack
      backScreens={[
        { name: "[id]", fallbackHref: "/practices" },
        { name: "new", fallbackHref: "/practices" },
      ]}
    />
  )
}
