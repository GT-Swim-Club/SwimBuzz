import { Children, useEffect, useMemo, useRef, type ReactNode } from "react"
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect"
import { radii, type ColorPalette } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"
import { useThemePreference } from "../lib/theme"

const EASE = Easing.bezier(0.32, 0.72, 0, 1)
const ICON_HIT = 32

export function SegmentedToggle({
  selectedIndex,
  children,
  style,
  fill = false,
  appearance = "solid",
}: {
  selectedIndex: number
  children: ReactNode
  style?: StyleProp<ViewStyle>
  fill?: boolean
  appearance?: "solid" | "glass"
}) {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const glass = appearance === "glass" && isLiquidGlassAvailable()
  const styles = useMemo(() => makeStyles(c, colorScheme), [c, colorScheme])
  const items = Children.toArray(children)
  const layouts = useRef<{ x: number; y: number; width: number; height: number }[]>(
    []
  )
  const left = useRef(new Animated.Value(0)).current
  const top = useRef(new Animated.Value(0)).current
  const width = useRef(new Animated.Value(0)).current
  const height = useRef(new Animated.Value(0)).current
  const placed = useRef(false)
  const motion = useRef<Animated.CompositeAnimation | null>(null)
  const selectedRef = useRef(selectedIndex)
  selectedRef.current = selectedIndex

  function moveTo(index: number, animated: boolean) {
    const layout = layouts.current[index]
    if (!layout || layout.width <= 0) return
    motion.current?.stop()
    motion.current = null
    if (!animated || !placed.current) {
      left.setValue(layout.x)
      top.setValue(layout.y)
      width.setValue(layout.width)
      height.setValue(layout.height)
      placed.current = true
      return
    }
    const next = Animated.parallel([
      Animated.timing(left, {
        toValue: layout.x,
        duration: 280,
        easing: EASE,
        useNativeDriver: false,
      }),
      Animated.timing(top, {
        toValue: layout.y,
        duration: 280,
        easing: EASE,
        useNativeDriver: false,
      }),
      Animated.timing(width, {
        toValue: layout.width,
        duration: 280,
        easing: EASE,
        useNativeDriver: false,
      }),
      Animated.timing(height, {
        toValue: layout.height,
        duration: 280,
        easing: EASE,
        useNativeDriver: false,
      }),
    ])
    motion.current = next
    next.start(({ finished }) => {
      if (finished && motion.current === next) motion.current = null
    })
  }

  useEffect(() => {
    moveTo(selectedIndex, placed.current)
  }, [selectedIndex])

  const Track = glass ? GlassView : View
  const trackProps = glass
    ? {
        colorScheme,
        glassEffectStyle: "regular" as const,
        isInteractive: true,
      }
    : {}

  return (
    <Track
      {...trackProps}
      style={[
        styles.track,
        glass && styles.trackGlass,
        !glass && appearance === "glass" && styles.trackGlassFallback,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          appearance === "glass" && styles.pillOnGlass,
          { left, top, width, height },
        ]}
      />
      {items.map((child, index) => (
        <View
          key={index}
          style={[styles.slot, fill && styles.slotFill]}
          onLayout={(event) => {
            const next = event.nativeEvent.layout
            layouts.current[index] = {
              x: next.x,
              y: next.y,
              width: next.width,
              height: next.height,
            }
            if (index === selectedRef.current && !motion.current) {
              moveTo(index, false)
            }
          }}
        >
          {child}
        </View>
      ))}
    </Track>
  )
}

export function SegmentedOption({
  selected,
  onPress,
  accessibilityLabel,
  children,
  flex = false,
}: {
  selected: boolean
  onPress: () => void
  accessibilityLabel: string
  children: ReactNode
  flex?: boolean
}) {
  const lock = useRef(false)
  function select() {
    if (lock.current) return
    lock.current = true
    onPress()
    requestAnimationFrame(() => {
      lock.current = false
    })
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={select}
      onPressIn={select}
      style={[
        stylesOption.base,
        flex ? stylesOption.flex : stylesOption.icon,
      ]}
    >
      {children}
    </Pressable>
  )
}

const stylesOption = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    height: ICON_HIT,
    width: ICON_HIT,
  },
  flex: {
    flex: 1,
    minHeight: ICON_HIT,
    paddingHorizontal: 12,
  },
})

function makeStyles(c: ColorPalette, colorScheme: "light" | "dark") {
  return StyleSheet.create({
    track: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      overflow: "hidden",
      padding: 3,
    },
    trackGlass: {
      backgroundColor: "transparent",
      borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)",
      borderRadius: 22,
      padding: 4,
    },
    trackGlassFallback: {
      backgroundColor:
        colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.72)",
      borderRadius: 22,
    },
    pill: {
      backgroundColor: c.primary,
      borderRadius: radii.sm,
      position: "absolute",
    },
    pillOnGlass: {
      borderRadius: 18,
    },
    slot: {
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    slotFill: {
      flex: 1,
    },
  })
}
