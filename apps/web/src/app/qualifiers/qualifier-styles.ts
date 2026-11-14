// Classes shared by the Nationals list and gallery layouts (no "use client": the skeleton imports them too).

/** The viewer's own rows and card: a solid primary-bg tint, the same on every surface. */
export const meTintClass = "bg-[color-mix(in_srgb,var(--brand-color-primary-bg)_60%,var(--brand-color-bg-container))]"

/** The initials avatar beside an athlete, in both layouts. */
export const qualifierAvatarClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary-bg text-sm font-semibold text-primary-text transition-colors"

/** The "You" pill after the viewer's name. */
export const youPillClass =
  "shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-4 text-primary-contrast"

/** "Women · 3 cuts", or just "3 cuts" when the page is already filtered to one gender. */
export function athleteCutsLabel(gender: string, cutCount: number, showGender: boolean) {
  const cuts = `${cutCount} ${cutCount === 1 ? "cut" : "cuts"}`
  return showGender ? `${gender === "F" ? "Women" : "Men"} · ${cuts}` : cuts
}
