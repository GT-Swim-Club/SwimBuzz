import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { NativeTabs, Icon, Label, VectorIcon } from "expo-router/unstable-native-tabs"
import { usePalette } from "@swimbuzz/ui"
import { useThemePreference } from "../../src/lib/theme"

export default function TabsLayout() {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  return (
    <NativeTabs
      tintColor={c.primary}
      backgroundColor={c.bgContainer}
      blurEffect={
        colorScheme === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight"
      }
      disableTransparentOnScrollEdge
      minimizeBehavior="automatic"
      labelVisibilityMode="labeled"
    >
      <NativeTabs.Trigger name="practices">
        <Label>Practices</Label>
        <Icon
          sf={{ default: "doc.text", selected: "doc.text.fill" }}
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="file-document-outline" />
          }
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="meets">
        <Label>Meets</Label>
        <Icon
          sf={{ default: "calendar", selected: "calendar" }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="calendar" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="roster">
        <Label>Roster</Label>
        <Icon
          sf={{ default: "person.2", selected: "person.2.fill" }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="account-group-outline" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="nationals">
        <Label>Nationals</Label>
        <Icon
          sf={{ default: "trophy", selected: "trophy.fill" }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="trophy-outline" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="you">
        <Label>You</Label>
        <Icon
          sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="account-circle-outline" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger hidden name="index" />
    </NativeTabs>
  )
}
