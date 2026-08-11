import { Tabs } from "expo-router"
import { Text } from "react-native"
import { colors } from "@swimbuzz/tokens"

function TabLabel({
  label,
  focused,
}: {
  label: string
  focused: boolean
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? "700" : "500",
        color: focused ? colors.light.primaryActive : colors.light.textTertiary,
      }}
    >
      {label}
    </Text>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.light.primaryBg },
        headerTintColor: colors.light.primaryText,
        tabBarStyle: {
          backgroundColor: colors.light.bgContainer,
          borderTopColor: colors.light.border,
        },
        tabBarActiveTintColor: colors.light.primaryActive,
        tabBarInactiveTintColor: colors.light.textTertiary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="meets"
        options={{
          title: "Meets",
          headerShown: false,
          tabBarLabel: ({ focused }) => <TabLabel label="Meets" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="practices"
        options={{
          title: "Practices",
          headerShown: false,
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Practices" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="nationals"
        options={{
          title: "Nationals",
          headerShown: false,
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Nationals" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="roster"
        options={{
          title: "Roster",
          headerShown: false,
          tabBarLabel: ({ focused }) => <TabLabel label="Roster" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarLabel: ({ focused }) => <TabLabel label="Alerts" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Settings" focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}
