import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  FlatList as RNFlatList,
  Modal,
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
import { useSafeAreaInsets } from "react-native-safe-area-context"
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
  /** A plain string renders as the usual right-aligned Text; pass a node (e.g. RelativeDateText) to compose a pressable value. */
  value: React.ReactNode
}) {
  const styles = useStyles()
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={styles.metaValue}>{value}</Text>
      ) : (
        <View style={styles.metaValueRow}>{value}</View>
      )}
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

/**
 * Animated pulse placeholder — the genuine-first-load counterpart to
 * `LoadingBlock`'s spinner. With TanStack Query cache in place, most
 * revalidations never show this at all; it's only for the first fetch with
 * no cached data yet.
 */
export function Skeleton({ style }: { style?: ViewProps["style"] }) {
  const c = usePalette()
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        { backgroundColor: c.fillSecondary, borderRadius: radii.sm, opacity },
        style,
      ]}
    />
  )
}

/** Placeholder for a `ListRow` — a title-width bar and a shorter subtitle bar. */
export function ListRowSkeleton() {
  const styles = useStyles()
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Skeleton style={{ height: 16, width: "60%", marginBottom: spacing.xxs }} />
        <Skeleton style={{ height: 13, width: "40%" }} />
      </View>
    </View>
  )
}

/** Placeholder for a gallery-style card (e.g. `GalleryTile`). */
export function CardSkeleton() {
  const styles = useStyles()
  return (
    <View style={styles.cardSkeleton}>
      <Skeleton style={{ height: 16, width: "70%", marginBottom: spacing.xs }} />
      <Skeleton style={{ height: 13, width: "50%" }} />
    </View>
  )
}

/**
 * Renders a " · "-joined subtitle from mixed string/node segments as flex-row
 * siblings, falsy entries dropped — the same rule as `titleAdornment`: a node
 * (e.g. a pressable RelativeDateText) must never be nested inside a subtitle
 * Text, which RN doesn't render reliably.
 */
export function SubtitleSegments({
  segments,
  textStyle,
}: {
  segments: React.ReactNode[]
  textStyle: TextProps["style"]
}) {
  const filtered = segments.filter((segment) => segment !== null && segment !== undefined && segment !== false && segment !== "")
  return (
    <>
      {filtered.map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <Text style={textStyle}> · </Text> : null}
          {typeof segment === "string" ? <Text style={textStyle}>{segment}</Text> : segment}
        </React.Fragment>
      ))}
    </>
  )
}

export function ListRow({
  title,
  titleAdornment,
  subtitle,
  subtitleSegments,
  onPress,
  left,
  right,
}: {
  title: string
  /** Rendered as a sibling right after the title (e.g. a staff badge icon) — never nested inside the title Text, which RN doesn't render reliably. */
  titleAdornment?: React.ReactNode
  subtitle?: string
  /** " · "-joined segments (string or node) — for a subtitle containing a pressable element. Takes precedence over `subtitle`. */
  subtitleSegments?: React.ReactNode[]
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
        {titleAdornment ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {title}
            </Text>
            {titleAdornment}
          </View>
        ) : (
          <Text style={styles.rowTitle}>{title}</Text>
        )}
        {subtitleSegments ? (
          <View style={styles.subtitleRow}>
            <SubtitleSegments segments={subtitleSegments} textStyle={styles.rowSubtitle} />
          </View>
        ) : subtitle ? (
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        ) : null}
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

export type ActionSheetItem = {
  key: string
  label: string
  icon?: React.ReactNode
  onPress: () => void
  disabled?: boolean
  busy?: boolean
  destructive?: boolean
}

/**
 * A grouped bottom sheet of tappable actions — e.g. a share menu. `groups` is
 * an array of item arrays; a divider is drawn between groups. Icons/spinners
 * are passed in as nodes (matching Button/Section's `icon?: React.ReactNode`)
 * rather than looked up by name, since this package has no icon registry of
 * its own.
 */
export function ActionSheet({
  visible,
  onClose,
  onDismiss,
  title,
  groups,
}: {
  visible: boolean
  onClose: () => void
  /**
   * Fires once the close animation actually finishes (iOS only — RN's
   * Modal#onDismiss). Use this to defer presenting another native UI (a
   * share sheet, an image/document picker) until this modal is fully gone:
   * iOS refuses to present on top of a modal that's still mid-dismiss, and
   * the request just hangs with no error.
   */
  onDismiss?: () => void
  title?: string
  groups: ActionSheetItem[][]
}) {
  const c = usePalette()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.actionSheetOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.actionSheetPanel, { paddingBottom: insets.bottom + spacing.md }]}>
          {title ? <Text style={styles.actionSheetTitle}>{title}</Text> : null}
          {groups.map((group, groupIndex) => (
            <View
              key={groupIndex}
              style={groupIndex > 0 ? styles.actionSheetGroupDivider : undefined}
            >
              {group.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  disabled={item.disabled || item.busy}
                  style={({ pressed }) => [
                    styles.actionSheetRow,
                    pressed && styles.rowPressed,
                    (item.disabled || item.busy) && styles.buttonDisabled,
                  ]}
                >
                  <View style={styles.actionSheetIcon}>
                    {item.busy ? <ActivityIndicator size="small" color={c.textSecondary} /> : item.icon}
                  </View>
                  <Text
                    style={[
                      styles.actionSheetLabel,
                      item.destructive && styles.actionSheetLabelDestructive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    </Modal>
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

type ToastContextValue = { showToast: (message: string) => void }
const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Renders a top-anchored, auto-dismissing pill toast — the touch equivalent of a
 * hover tooltip, for revealing something (e.g. a relative date's full value) with
 * a tap. Mount once near the app root, inside PaletteProvider (usePalette/useStyles
 * need it) and inside a SafeAreaProvider (useSafeAreaInsets needs it).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((text: string) => {
    setMessage(text)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setMessage(null), 2000)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {/* flex:1 gives the toast overlay a full-screen positioning bounds to
          anchor "absolute" against — RN positions absolute children relative
          to their nearest parent's layout box, not the whole window. */}
      <View style={{ flex: 1 }}>
        {children}
        {message ? (
          <View
            pointerEvents="none"
            style={[styles.toastWrap, { top: insets.top + spacing.sm }]}
          >
            <View style={styles.toastPill}>
              <Text style={styles.toastText}>{message}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  )
}

/** Call `showToast(message)` to surface a brief top-anchored pill for ~2s. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a ToastProvider")
  return ctx
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
    metaValueRow: {
      flex: 1,
      flexDirection: "row",
      justifyContent: "flex-end",
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
    cardSkeleton: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.sm,
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
    subtitleRow: {
      marginTop: 2,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
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
    actionSheetOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: withAlpha("#000000", 0.45),
    },
    actionSheetPanel: {
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    actionSheetTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textSecondary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    actionSheetGroupDivider: {
      marginTop: spacing.xs,
      paddingTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    actionSheetRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: radii.md,
    },
    actionSheetIcon: {
      width: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    actionSheetLabel: {
      fontSize: 16,
      color: c.text,
    },
    actionSheetLabelDestructive: {
      color: c.error,
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
    toastWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 100,
    },
    toastPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgElevated,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    toastText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
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
