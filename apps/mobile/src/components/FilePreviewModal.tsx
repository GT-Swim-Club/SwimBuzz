import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  View,
  useColorScheme,
} from "react-native"
import { WebView } from "react-native-webview"
import { colors, spacing } from "@swimbuzz/tokens"

type FilePreviewModalProps = {
  open: boolean
  title: string
  url: string
  onClose: () => void
}

export function FilePreviewModal({
  open,
  title,
  url,
  onClose,
}: FilePreviewModalProps) {
  const colorScheme = useColorScheme()
  const palette = colors[colorScheme === "dark" ? "dark" : "light"]
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open) setLoading(true)
  }, [open, url])

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgContainer }}>
        <View
          style={{
            alignItems: "center",
            borderBottomColor: palette.border,
            borderBottomWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: palette.text, flex: 1, fontSize: 17, fontWeight: "600" }}
          >
            {title}
          </Text>
          <Pressable
            accessibilityLabel="Close file preview"
            onPress={onClose}
            style={({ pressed }) => ({
              opacity: pressed ? 0.65 : 1,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
            })}
          >
            <Text style={{ color: palette.link, fontSize: 16, fontWeight: "600" }}>
              Close
            </Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: url }}
            onLoadEnd={() => setLoading(false)}
            onError={() => setLoading(false)}
            setSupportMultipleWindows={false}
            style={{ backgroundColor: palette.bgContainer, flex: 1 }}
          />
          {loading ? (
            <View
              pointerEvents="none"
              style={{
                alignItems: "center",
                backgroundColor: palette.bgContainer,
                bottom: 0,
                justifyContent: "center",
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
              }}
            >
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  )
}
