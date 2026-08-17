import React, { createContext, useContext, useMemo, useState } from "react"
import {
  ActivityIndicator,
  FlatList as RNFlatList,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type FlatListProps,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from "react-native"
import {
  paletteFor,
  radii,
  spacing,
  type ColorPalette,
} from "@swimbuzz/tokens"

const PaletteContext = createContext<ColorPalette | null>(null)

export function PaletteProvider({
  scheme,
  children,
}: {
  scheme?: string | null
  children: React.ReactNode
}) {
  const value = paletteFor(scheme)
  return (
    <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>
  )
}

export function usePalette() {
  const ctx = useContext(PaletteContext)
  const scheme = useColorScheme()
  return ctx ?? paletteFor(scheme)
}

function useStyles() {
  const c = usePalette()
  return useMemo(() => makeStyles(c), [c])
}

export function Screen({ style, ...props }: ViewProps) {
  const styles = useStyles()
  return <View collapsable={false} style={[styles.screen, style]} {...props} />
}

export function Title({ style, ...props }: TextProps) {
  const styles = useStyles()
  return <Text style={[styles.title, style]} {...props} />
}

export function Body({ style, ...props }: TextProps) {
  const styles = useStyles()
  return <Text style={[styles.body, style]} {...props} />
}

export function Muted({ style, ...props }: TextProps) {
  const styles = useStyles()
  return <Text style={[styles.muted, style]} {...props} />
}

export function Section({
  title,
  icon,
  children,
  style,
}: {
  title?: string
  icon?: React.ReactNode
  children: React.ReactNode
  style?: ViewProps["style"]
}) {
  const styles = useStyles()
  return (
    <View style={[styles.section, style]}>
      {title ? <SectionHeader title={title} icon={icon} /> : null}
      {children}
    </View>
  )
}

export function SectionHeader({
  title,
  icon,
  right,
}: {
  title: string
  icon?: React.ReactNode
  right?: React.ReactNode
}) {
  const styles = useStyles()
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {right}
    </View>
  )
}

export function MetaRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const styles = useStyles()
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  accessibilityLabel,
}: {
  label?: string
  selected?: boolean
  onPress?: () => void
  icon?: React.ReactNode
  accessibilityLabel?: string
}) {
  const styles = useStyles()
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, icon != null && !label ? styles.chipIconOnly : null, selected && styles.chipSelected]}
    >
      {icon}
      {label ? (
        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  )
}

function withAlpha(hex: string, alpha: number) {
  const raw = hex.replace("#", "")
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function TextField({
  label,
  error,
  style,
  onBlur,
  onFocus,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  const c = usePalette()
  const styles = useStyles()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.textTertiary}
        style={[
          styles.input,
          focused && !error && styles.inputFocused,
          error && styles.inputError,
          style,
        ]}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  )
}

export function IconButton({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress?: () => void
  disabled?: boolean
}) {
  const styles = useStyles()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.rowPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.iconButtonLabel}>{label}</Text>
    </Pressable>
  )
}

export function LoadingBlock() {
  const c = usePalette()
  const styles = useStyles()
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={c.primaryActive} />
    </View>
  )
}

export function ErrorBlock({ message }: { message: string }) {
  const styles = useStyles()
  return (
    <View style={styles.errorBlock}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  )
}

export function ListRow({
  title,
  subtitle,
  onPress,
  left,
  right,
}: {
  title: string
  subtitle?: string
  onPress?: () => void
  left?: React.ReactNode
  right?: React.ReactNode
}) {
  const styles = useStyles()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      disabled={!onPress}
    >
      {left}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.rowChevron}>›</Text> : null)}
    </Pressable>
  )
}

export function Button({
  label,
  loading,
  variant = "primary",
  icon,
  style,
  disabled,
  ...props
}: PressableProps & {
  label: string
  loading?: boolean
  variant?: "primary" | "secondary" | "danger"
  icon?: React.ReactNode
}) {
  const c = usePalette()
  const styles = useStyles()
  const isPrimary = variant === "primary"
  const isDanger = variant === "danger"
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        isDanger && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
        style as object,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? c.primaryText : c.text} />
      ) : (
        <View style={styles.buttonContent}>
          {icon}
          <Text
            style={[
              styles.buttonLabel,
              isPrimary && styles.buttonLabelPrimary,
              isDanger && styles.buttonLabelDanger,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  const styles = useStyles()
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bgLayout,
      padding: spacing.md,
    },
    title: {
      fontSize: 26,
      fontWeight: "700",
      color: c.text,
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: 16,
      color: c.text,
      lineHeight: 22,
    },
    muted: {
      fontSize: 14,
      color: c.textSecondary,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    sectionTitleRow: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: spacing.xs,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
    },
    metaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    metaLabel: {
      fontSize: 14,
      color: c.textSecondary,
      flexShrink: 0,
    },
    metaValue: {
      fontSize: 14,
      color: c.text,
      fontWeight: "500",
      textAlign: "right",
      flex: 1,
    },
    chip: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs + 2,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgContainer,
      marginRight: spacing.xs,
      marginBottom: spacing.xs,
    },
    chipIconOnly: {
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: spacing.xs,
    },
    chipSelected: {
      backgroundColor: c.primaryBg,
      borderColor: c.primaryActive,
    },
    chipLabel: {
      fontSize: 13,
      color: c.text,
      fontWeight: "500",
    },
    chipLabelSelected: {
      color: c.primaryText,
      fontWeight: "700",
    },
    field: {
      marginBottom: spacing.sm,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textSecondary,
      marginBottom: spacing.xxs,
    },
    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      backgroundColor: c.bgContainer,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      fontSize: 16,
      color: c.text,
    },
    inputFocused: {
      borderColor: c.primary,
      boxShadow: `0px 0px 0px 3px ${withAlpha(c.primary, 0.34)}`,
    },
    inputError: {
      borderColor: c.error,
      boxShadow: `0px 0px 0px 3px ${withAlpha(c.error, 0.1)}`,
    },
    fieldError: {
      marginTop: spacing.xxs,
      fontSize: 13,
      color: c.error,
    },
    iconButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    iconButtonLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: c.primaryActive,
    },
    loading: {
      paddingVertical: spacing.xxl,
      alignItems: "center",
    },
    errorBlock: {
      padding: spacing.md,
      backgroundColor: c.primaryBg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.error,
      marginBottom: spacing.md,
    },
    errorText: {
      color: c.error,
      fontSize: 14,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: c.bgContainer,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    rowPressed: {
      opacity: 0.85,
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: c.text,
    },
    rowSubtitle: {
      marginTop: 2,
      fontSize: 13,
      color: c.textSecondary,
    },
    rowChevron: {
      color: c.textTertiary,
      fontSize: 24,
      fontWeight: "300",
      marginLeft: spacing.sm,
    },
    button: {
      minHeight: 44,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    buttonContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    buttonPrimary: {
      backgroundColor: c.primary,
    },
    buttonSecondary: {
      backgroundColor: c.bgContainer,
      borderWidth: 1,
      borderColor: c.border,
    },
    buttonDanger: {
      backgroundColor: c.error,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonPressed: {
      opacity: 0.9,
    },
    buttonLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: c.text,
    },
    buttonLabelPrimary: {
      color: c.primaryText,
    },
    buttonLabelDanger: {
      color: "#fff",
    },
    empty: {
      paddingVertical: spacing.xxl,
      alignItems: "center",
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: c.text,
    },
    emptyBody: {
      marginTop: spacing.xs,
      fontSize: 14,
      color: c.textSecondary,
      textAlign: "center",
    },
  })
}

export const ScrollView = React.forwardRef<RNScrollView, ScrollViewProps>(
  function ScrollView(props, ref) {
    return (
      <RNScrollView
        {...props}
        ref={ref}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    )
  }
)

export function FlatList<ItemT>(props: FlatListProps<ItemT>) {
  return (
    <RNFlatList
      {...props}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    />
  )
}
