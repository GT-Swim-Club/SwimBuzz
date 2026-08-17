import type { IconName } from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { Icon } from "./Icon"
import { SegmentedOption, SegmentedToggle } from "./SegmentedToggle"
import type { DefaultPracticesView } from "../lib/view-preferences"

const OPTIONS: Array<{ view: DefaultPracticesView; label: string; icon: IconName }> = [
  { view: "week", label: "Week", icon: "calendarWeek" },
  { view: "month", label: "Month", icon: "calendarMonth" },
  { view: "list", label: "List", icon: "list" },
]

export function PracticeViewToggle({
  value,
  onChange,
}: {
  value: DefaultPracticesView
  onChange: (value: DefaultPracticesView) => void
}) {
  const c = usePalette()
  const selectedIndex = Math.max(
    0,
    OPTIONS.findIndex((option) => option.view === value)
  )

  return (
    <SegmentedToggle selectedIndex={selectedIndex}>
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
              color={selected ? c.primaryText : c.textSecondary}
            />
          </SegmentedOption>
        )
      })}
    </SegmentedToggle>
  )
}
