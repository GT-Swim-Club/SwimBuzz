// Classes shared by the Nationals list and gallery layouts (no "use client": the skeleton imports them too).

/**
 * The viewer's own rows and card, tinted like the "You" section of a meet's roster summary: 4% gold
 * over the card background (mixed solid, so it's the same on every surface), and the swim rows inside
 * it (QualifierSwimRow) hover to the same 4% gold over the hover wash. Only the gallery layout uses
 * it — the list layout leaves the viewer's rows untinted, marked by the "You" pill alone.
 */
export const meTintClass =
  "bg-[color-mix(in_oklab,var(--color-accent)_4%,var(--color-background))] [--qualifier-row-hover:color-mix(in_oklab,var(--color-accent)_4%,var(--color-background-hover))]"

/**
 * A list section's header row fill: the page background, a shade off the card, so the headers stand
 * apart from the swim rows without a divider under them.
 */
export const qualifierHeaderBgClass = "bg-background-layout"

/** The initials avatar beside an athlete, in both layouts — styled like the header's profile menu avatar. */
export const qualifierAvatarClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-secondary bg-primary/10 text-sm font-medium text-accent transition-colors"

/** The smaller initials avatar in a list section's header row. */
export const qualifierListAvatarClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-secondary bg-primary/10 text-xs font-medium text-accent"

/** The "You" pill after the viewer's name. */
export const youPillClass =
  "shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-4 text-primary-contrast"

/** "Women · 3 cuts", or just "3 cuts" when the page is already filtered to one gender. */
export function athleteCutsLabel(gender: string, cutCount: number, showGender: boolean) {
  const cuts = `${cutCount} ${cutCount === 1 ? "cut" : "cuts"}`
  return showGender ? `${gender === "F" ? "Women" : "Men"} · ${cuts}` : cuts
}
