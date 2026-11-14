import type { StyleProp, ViewStyle } from "react-native"
import { usePalette } from "@swimbuzz/ui"
import { Icon } from "./Icon"
import { SegmentedOption, SegmentedToggle } from "./SegmentedToggle"
import type { DefaultView } from "../lib/view-preferences"

const OPTIONS = [
  { view: "gallery", label: "Gallery view", icon: "gallery" },
  { view: "list", label: "List view", icon: "list" },
] as const

/** Gallery / list switch for the Roster, Meets and Nationals screens. */
export function GalleryViewToggle({
  value,
  onChange,
  style,
}: {
  value: DefaultView
  onChange: (value: DefaultView) => void
  style?: StyleProp<ViewStyle>
}) {
  const c = usePalette()
  return (
    <SegmentedToggle selectedIndex={value === "list" ? 1 : 0} style={style}>
      {OPTIONS.map((option) => {
        const selected = option.view === value
        return (
          <SegmentedOption
            key={option.view}
            selected={selected}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.view)}
          >
            <Icon
              name={option.icon}
              size={18}
              color={selected ? c.primaryContrast : c.textSecondary}
            />
          </SegmentedOption>
        )
      })}
    </SegmentedToggle>
  )
}
