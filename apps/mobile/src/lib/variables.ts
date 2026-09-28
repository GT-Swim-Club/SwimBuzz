import { colors, type ColorPalette } from "@swimbuzz/tokens"

/**
 * Mobile color scheme variables.
 * Mirrors apps/web/src/app/variables.css (`:root` / `.dark` `--brand-color-*`).
 */
function colorSchemeVariables(c: ColorPalette) {
  return {
    "--brand-color-primary": c.primary,
    "--brand-color-primary-bg": c.primaryBg,
    "--brand-color-primary-bg-hover": c.primaryBgHover,
    "--brand-color-primary-border": c.primaryBorder,
    "--brand-color-primary-border-hover": c.primaryBorderHover,
    "--brand-color-primary-hover": c.primaryHover,
    "--brand-color-primary-active": c.primaryActive,
    "--brand-color-primary-text": c.primaryText,
    "--brand-color-success": c.success,
    "--brand-color-success-bg": c.successBg,
    "--brand-color-success-border": c.successBorder,
    "--brand-color-success-hover": c.successHover,
    "--brand-color-success-active": c.successActive,
    "--brand-color-warning": c.warning,
    "--brand-color-warning-bg": c.warningBg,
    "--brand-color-warning-border": c.warningBorder,
    "--brand-color-warning-hover": c.warningHover,
    "--brand-color-warning-active": c.warningActive,
    "--brand-color-error": c.error,
    "--brand-color-error-bg": c.errorBg,
    "--brand-color-error-border": c.errorBorder,
    "--brand-color-error-hover": c.errorHover,
    "--brand-color-error-active": c.errorActive,
    "--brand-color-info": c.info,
    "--brand-color-info-bg": c.infoBg,
    "--brand-color-info-border": c.infoBorder,
    "--brand-color-link": c.link,
    "--brand-color-link-hover": c.linkHover,
    "--brand-color-link-active": c.linkActive,
    "--brand-color-text": c.text,
    "--brand-color-text-secondary": c.textSecondary,
    "--brand-color-text-tertiary": c.textTertiary,
    "--brand-color-text-quaternary": c.textQuaternary,
    "--brand-color-fill": c.fill,
    "--brand-color-fill-secondary": c.fillSecondary,
    "--brand-color-fill-tertiary": c.fillTertiary,
    "--brand-color-fill-quaternary": c.fillQuaternary,
    "--brand-color-bg-layout": c.bgLayout,
    "--brand-color-bg-container": c.bgContainer,
    "--brand-color-bg-elevated": c.bgElevated,
    "--brand-color-switch-thumb": c.switchThumb,
    "--brand-color-switch-track": c.switchTrack,
    "--brand-color-border": c.border,
    "--brand-color-border-secondary": c.borderSecondary,
    "--brand-color-border-subtle": c.borderSubtle,
    "--brand-color-accent": c.accent,
  } as const
}

export const variables = {
  light: colorSchemeVariables(colors.light),
  dark: colorSchemeVariables(colors.dark),
} as const

export type ColorSchemeVariables = (typeof variables)["light"]

export function variablesFor(scheme?: string | null): ColorSchemeVariables {
  return scheme === "dark" ? variables.dark : variables.light
}
