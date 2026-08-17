"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import HoverDetail from "@/components/HoverDetail"
import { AppIcon } from "@/components/AppIcon"
import { SegmentedToggle, segmentedIconOptionClass } from "@/components/SegmentedToggle"
import type { IconName } from "@swimbuzz/shared"

const OPTIONS: {
  value: "light" | "dark" | "system"
  label: string
  icon: IconName
}[] = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
]

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const selected = mounted ? (theme ?? "system") : "system"

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-sm text-foreground">Theme</p>
        <p className="text-xs text-foreground-secondary">
          Light, dark, or match your device
        </p>
      </div>
      <SegmentedToggle
        selectedIndex={Math.max(
          0,
          OPTIONS.findIndex((option) => option.value === selected)
        )}
        className="shrink-0 rounded-lg border border-border bg-background"
      >
        {OPTIONS.map((option) => {
          const isSelected = selected === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={option.label}
              disabled={!mounted}
              onClick={() => setTheme(option.value)}
              className={"group relative " + segmentedIconOptionClass(isSelected)}
            >
              <AppIcon name={option.icon} className="h-4 w-4" />
              <HoverDetail label={option.label} />
            </button>
          )
        })}
      </SegmentedToggle>
    </div>
  )
}
