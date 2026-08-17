import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { usePalette } from "@swimbuzz/ui"
import { useAuth } from "../src/lib/auth"

export default function Index() {
  const { user, loading } = useAuth()
  const c = usePalette()

  if (loading) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: c.bgLayout,
          flex: 1,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={c.primaryActive} />
      </View>
    )
  }

  if (user) return <Redirect href="/practices" />
  return <Redirect href="/welcome" />
}
