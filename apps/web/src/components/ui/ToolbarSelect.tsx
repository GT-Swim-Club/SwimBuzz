"use client"

import type { IconName } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { useToolbarCondensed } from "@/components/ui/FluidToolbar"

const selectClass =
  "h-[42px] cursor-pointer appearance-none rounded-lg border border-border bg-background pl-3 pr-9 text-sm tabular-nums text-foreground"

/**
 * A FluidToolbar dropdown. When the toolbar is condensed it shrinks to an icon
 * button — the real select sits invisibly over the icon, so tapping it still
 * opens the native picker. A dot marks a non-default value.
 */
export default function ToolbarSelect({
  label,
  value,
  onChange,
  icon,
  current,
  active,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  icon: IconName
  /** The selected option's label, shown on hover while condensed. */
  current: string
  /** Narrowed from the default (gets a dot while condensed). */
  active: boolean
  children: React.ReactNode
}) {
  const condensed = useToolbarCondensed()
  return (
    <div className="relative inline-flex shrink-0">
      {/* Width probe: the full select's natural width, which FluidToolbar
          reads to decide whether the full controls would fit — in either mode,
          so the switch can't flip-flop. Clipped to nothing so it never adds
          scroll overflow. */}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
        <select data-measure tabIndex={-1} value={value} onChange={() => {}} className={selectClass}>
          {children}
        </select>
      </div>
      {condensed ? (
        <div className="group relative flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors focus-within:border-primary hover:bg-fill-secondary">
          <AppIcon name={icon} className="h-4 w-4" />
          {active && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
          <select
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          >
            {children}
          </select>
          <HoverDetail label={current} />
        </div>
      ) : (
        <>
          <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
            {children}
          </select>
          <AppIcon
            name="chevronDown"
            className="pointer-events-none absolute right-3 top-[13px] h-4 w-4 text-foreground-secondary"
          />
        </>
      )}
    </div>
  )
}
