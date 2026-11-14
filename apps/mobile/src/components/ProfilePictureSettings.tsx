import { useState } from "react"
import { Alert, StyleSheet, View } from "react-native"
import * as ImagePicker from "expo-image-picker"
import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import { Body, Button, Muted } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { UserAvatar } from "./UserAvatar"
import { api, refreshSession } from "../lib/api"
import { useAuth } from "../lib/auth"

// Same size and quality as web's ProfilePictureSettings crop.
const AVATAR_EDGE = 192
const AVATAR_JPEG_QUALITY = 0.82

/** Square-crop and shrink a picked photo to the avatar size, as a JPEG (HEIC included). */
async function prepareAvatar(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri)
  const side = Math.min(asset.width, asset.height)
  if (side > 0 && asset.width !== asset.height) {
    context.crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    })
  }
  context.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE })
  const image = await context.renderAsync()
  try {
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: AVATAR_JPEG_QUALITY,
    })
    return saved.uri
  } finally {
    image.release()
    context.release()
  }
}

/**
 * Upload / change / remove the profile picture through /api/profile/avatar —
 * the mobile counterpart of web Settings' ProfilePictureSettings. The picker's
 * own editor does the square crop.
 */
export function ProfilePictureSettings() {
  const { user, refreshUser } = useAuth()
  // The signed-in user's image comes from the access token, which only picks up
  // a new picture once refreshed — show the saved one here straight away.
  const [image, setImage] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null)
  const shown = image === undefined ? (user?.image ?? null) : image

  async function syncSessionUser() {
    try {
      const refreshed = await refreshSession()
      if (refreshed) await refreshUser()
    } catch {
      // The picture is saved; the You tab catches up on the next token refresh.
    }
  }

  async function pickAndUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    })
    const asset = result.canceled ? null : result.assets?.[0]
    if (!asset) return

    setBusy("upload")
    try {
      const uri = await prepareAvatar(asset)
      const form = new FormData()
      // React Native's FormData takes a { uri, name, type } file descriptor.
      form.append("file", { uri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob)
      const res = await api.uploadProfileAvatar(form)
      setImage(res.image ?? null)
      void syncSessionUser()
    } catch (err) {
      Alert.alert(
        "Couldn’t update profile picture",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setBusy(null)
    }
  }

  function confirmRemove() {
    Alert.alert("Remove profile picture?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy("remove")
            try {
              await api.removeProfileAvatar()
              setImage(null)
              void syncSessionUser()
            } catch (err) {
              Alert.alert(
                "Couldn’t remove profile picture",
                err instanceof Error ? err.message : "Something went wrong"
              )
            } finally {
              setBusy(null)
            }
          })()
        },
      },
    ])
  }

  return (
    <View style={styles.row}>
      <UserAvatar image={shown} name={user?.name} email={user?.email} size={56} />
      <View style={styles.copy}>
        <Body style={{ fontWeight: "600" }}>Profile picture</Body>
        <Muted>Shown beside your name around the app</Muted>
        <View style={styles.actions}>
          <Button
            label={shown ? "Change" : "Upload"}
            variant="secondary"
            loading={busy === "upload"}
            disabled={busy != null}
            onPress={() => void pickAndUpload()}
            style={styles.action}
          />
          {shown ? (
            <Button
              label="Remove"
              variant="secondary"
              loading={busy === "remove"}
              disabled={busy != null}
              onPress={confirmRemove}
              style={styles.action}
            />
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  copy: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
})
