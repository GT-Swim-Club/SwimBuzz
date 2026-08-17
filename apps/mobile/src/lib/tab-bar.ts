import { Platform } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { spacing } from "@swimbuzz/tokens"

/** Native tab bar height excluding the home indicator / system nav bar. */
const NATIVE_TAB_BAR_HEIGHT = Platform.OS === "android" ? 56 : 49

/** Extra scroll padding so last rows clear the floating native tab bar. */
export function useTabBarScrollPadding() {
  const insets = useSafeAreaInsets()
  return NATIVE_TAB_BAR_HEIGHT + insets.bottom + spacing.md
}
