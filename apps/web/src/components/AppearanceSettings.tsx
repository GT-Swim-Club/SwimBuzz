"use client"

import { useTheme } from "next-themes"
import { useEffect, useState, type ReactNode } from "react"

const iconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4",
  "aria-hidden": true as const,
}

const OPTIONS: {
  value: "light" | "dark" | "system"
  label: string
  icon: ReactNode
}[] = [
  {
    value: "system",
    label: "System",
    icon: (
      <svg {...iconProps}>
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg {...iconProps}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    ),
  },
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
      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex shrink-0 rounded-lg border border-border p-0.5"
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
              title={option.label}
              disabled={!mounted}
              onClick={() => setTheme(option.value)}
              className={`inline-flex items-center justify-center rounded-md p-2 transition-colors disabled:opacity-50 ${
                isSelected
                  ? "bg-primary text-primary-text"
                  : "text-foreground-secondary hover:text-foreground"
              }`}
            >
              {option.icon}
            </button>
          )
        })}
      </div>
    </div>
  )
}
