import { useFocusEffect, useRouter } from "expo-router"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Image, Pressable, StyleSheet, Text, View } from "react-native"
import { spacing, type ColorPalette } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"
import { api } from "../lib/api"
import { useThemePreference } from "../lib/theme"
import { Icon } from "./Icon"

type AlertAnchor = { x: number; y: number; width: number; height: number }

const UnreadAlertsContext = createContext<{
  count: number
  setAnchor: (anchor: AlertAnchor | null) => void
} | null>(null)

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    header: {
      backgroundColor: c.bgContainer,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { color: c.text, fontSize: 17, fontWeight: "700" },
    titleContainer: { paddingLeft: spacing.sm },
    leftContainer: {
      justifyContent: "center",
      overflow: "visible",
    },
    rightContainer: {
      justifyContent: "center",
      overflow: "visible",
    },
    brand: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
    logo: { borderRadius: 6, height: 32, width: 32 },
    brandName: {
      color: c.primary,
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    chrome: { flex: 1 },
    alertWrap: {
      height: 36,
      width: 36,
    },
    alertButton: {
      alignItems: "center",
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    alertBadge: {
      alignItems: "center",
      backgroundColor: c.primary,
      borderRadius: 9,
      height: 18,
      justifyContent: "center",
      minWidth: 18,
      paddingHorizontal: 4,
      position: "absolute",
      zIndex: 20,
    },
    alertBadgeText: {
      color: c.primaryText,
      fontSize: 11,
      fontWeight: "700",
      lineHeight: 13,
    },
    pressed: { opacity: 0.72 },
  })
}

export function UnreadAlertsChrome({ children }: { children: ReactNode }) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const wrapRef = useRef<View>(null)
  const [count, setCount] = useState(0)
  const [anchor, setAnchor] = useState<AlertAnchor | null>(null)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })

  useFocusEffect(
    useCallback(() => {
      let active = true
      void api
        .listNotifications()
        .then(({ notifications }) => {
          if (active) setCount(notifications.filter((item) => !item.readAt).length)
        })
        .catch(() => {
          if (active) setCount(0)
        })
      return () => {
        active = false
      }
    }, [])
  )

  const value = useMemo(() => ({ count, setAnchor }), [count])

  return (
    <UnreadAlertsContext.Provider value={value}>
      <View
        ref={wrapRef}
        collapsable={false}
        onLayout={() => {
          wrapRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))
        }}
        style={styles.chrome}
      >
        {children}
        {count > 0 && anchor ? (
          <View
            pointerEvents="none"
            style={[
              styles.alertBadge,
              {
                left: anchor.x - origin.x + anchor.width / 2,
                top: anchor.y - origin.y + anchor.height / 2 - 18,
              },
            ]}
          >
            <Text style={styles.alertBadgeText}>{count > 9 ? "9+" : count}</Text>
          </View>
        ) : null}
      </View>
    </UnreadAlertsContext.Provider>
  )
}

export function HeaderBrand({ compact = false }: { compact?: boolean }) {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const styles = useMemo(() => makeStyles(c), [c])
  const brandColor = colorScheme === "dark" ? c.primaryHover : c.primaryActive
  return (
    <View style={styles.brand}>
      <Image source={require("../../assets/swimbuzz-logo.png")} style={styles.logo} />
      {!compact ? <Text style={[styles.brandName, { color: brandColor }]}>SwimBuzz</Text> : null}
    </View>
  )
}

export function HeaderAlertsButton() {
  const router = useRouter()
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const alerts = useContext(UnreadAlertsContext)
  const buttonRef = useRef<View>(null)

  const publishAnchor = useCallback(() => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      alerts?.setAnchor({ x, y, width, height })
    })
  }, [alerts])

  useFocusEffect(
    useCallback(() => {
      publishAnchor()
      return () => alerts?.setAnchor(null)
    }, [alerts, publishAnchor])
  )

  return (
    <View ref={buttonRef} collapsable={false} onLayout={publishAnchor} style={styles.alertWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          alerts && alerts.count > 0
            ? `Open notifications, ${alerts.count} unread`
            : "Open notifications"
        }
        hitSlop={8}
        onPress={() => router.push("/notifications")}
        style={({ pressed }) => [styles.alertButton, pressed && styles.pressed]}
      >
        <Icon color={c.text} name="bell" size={20} />
      </Pressable>
    </View>
  )
}

export function useAppHeaderOptions() {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  return useMemo(
    () => ({
      headerStyle: styles.header,
      headerShadowVisible: false,
      headerTintColor: c.text,
      headerTitleStyle: styles.headerTitle,
      headerTitleAlign: "left" as const,
      headerTitleContainerStyle: styles.titleContainer,
      headerLeftContainerStyle: styles.leftContainer,
      headerRightContainerStyle: styles.rightContainer,
    }),
    [c, styles]
  )
}

export function useTabChromeHeaderOptions() {
  const appHeaderOptions = useAppHeaderOptions()
  return useMemo(
    () => ({
      ...appHeaderOptions,
      headerShown: true,
      headerBackVisible: false,
      headerTitle: () => <HeaderBrand />,
      headerRight: () => <HeaderAlertsButton />,
    }),
    [appHeaderOptions]
  )
}
