import React from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from "react-native"
import { colors, radii, spacing } from "@swimbuzz/tokens"

const c = colors.light

export function Screen({ style, ...props }: ViewProps) {
  return <View style={[styles.screen, style]} {...props} />
}

export function Title({ style, ...props }: TextProps) {
  return <Text style={[styles.title, style]} {...props} />
}

export function Body({ style, ...props }: TextProps) {
  return <Text style={[styles.body, style]} {...props} />
}

export function Muted({ style, ...props }: TextProps) {
  return <Text style={[styles.muted, style]} {...props} />
}

export function Section({
  title,
  children,
  style,
}: {
  title?: string
  children: React.ReactNode
  style?: ViewProps["style"]
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? <SectionHeader title={title} /> : null}
      {children}
    </View>
  )
}

export function SectionHeader({
  title,
  right,
}: {
  title: string
  right?: React.ReactNode
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
}: {
  label: string
  selected?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  )
}

export function TextField({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.textTertiary}
        style={[styles.input, style]}
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
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={c.primaryActive} />
    </View>
  )
}

export function ErrorBlock({ message }: { message: string }) {
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
  right,
}: {
  title: string
  subtitle?: string
  onPress?: () => void
  right?: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      disabled={!onPress}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
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
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgContainer,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
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
    backgroundColor: "#fff1f0",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#ffccc7",
    marginBottom: spacing.md,
  },
  errorText: {
    color: c.error,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
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
