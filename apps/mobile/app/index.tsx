import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { useAuth } from "../src/lib/auth"
import { colors } from "@swimbuzz/tokens"

export default function Index() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.light.bgLayout,
        }}
      >
        <ActivityIndicator color={colors.light.primaryActive} />
      </View>
    )
  }

  if (!user) return <Redirect href="/sign-in" />
  return <Redirect href="/(tabs)" />
}
