import { useState } from "react"
import { Alert, Platform, StyleSheet, TextInput, View } from "react-native"
import Constants from "expo-constants"
import { Redirect, useRouter } from "expo-router"
import * as Google from "expo-auth-session/providers/google"
import * as WebBrowser from "expo-web-browser"
import { Body, Button, Screen, Title } from "@swimbuzz/ui"
import { colors, radii, spacing } from "@swimbuzz/tokens"
import { useAuth } from "../../src/lib/auth"

WebBrowser.maybeCompleteAuthSession()

const googleClientIds = {
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || undefined,
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined,
}

/** Expo Go cannot satisfy Google's native OAuth redirect rules. */
const isExpoGo = Constants.appOwnership === "expo"

const platformGoogleClientId =
  Platform.OS === "ios"
    ? googleClientIds.ios
    : Platform.OS === "android"
      ? googleClientIds.android
      : googleClientIds.web

const googleReady = Boolean(platformGoogleClientId) && !isExpoGo

export default function SignInScreen() {
  const { user, loading, requestCode, signInWithEmail, signInWithGoogle } =
    useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Redirect href="/(tabs)" />

  async function onRequestCode() {
    setBusy(true)
    try {
      await requestCode(email.trim())
      setStep("code")
    } catch (err) {
      Alert.alert(
        "Could not send code",
        err instanceof Error ? err.message : "Try again"
      )
    } finally {
      setBusy(false)
    }
  }

  async function onVerify() {
    setBusy(true)
    try {
      await signInWithEmail(email.trim(), code.trim())
      router.replace("/(tabs)")
    } catch (err) {
      Alert.alert(
        "Sign-in failed",
        err instanceof Error ? err.message : "Invalid code"
      )
    } finally {
      setBusy(false)
    }
  }

  function onGoogleUnavailable() {
    if (isExpoGo) {
      Alert.alert(
        "Google sign-in unavailable",
        "Google blocks OAuth inside Expo Go. Use the email code below, or run a development build with separate iOS/Android OAuth client IDs."
      )
      return
    }
    Alert.alert(
      "Google sign-in",
      "Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / ANDROID / WEB_CLIENT_ID in apps/mobile/.env. Use native OAuth clients from Google Cloud Console — not the web client ID for iOS/Android."
    )
  }

  return (
    <Screen>
      <Title>SwimBuzz</Title>
      <Body style={{ marginBottom: spacing.lg }}>
        Sign in with your @gatech.edu email on the team roster.
      </Body>

      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="you@gatech.edu"
        placeholderTextColor={colors.light.textTertiary}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        editable={step === "email"}
      />

      {step === "code" ? (
        <TextInput
          keyboardType="number-pad"
          placeholder="6-digit code"
          placeholderTextColor={colors.light.textTertiary}
          style={styles.input}
          value={code}
          onChangeText={setCode}
          maxLength={6}
        />
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {step === "email" ? (
          <Button label="Send code" loading={busy} onPress={onRequestCode} />
        ) : (
          <>
            <Button label="Verify & sign in" loading={busy} onPress={onVerify} />
            <Button
              label="Use a different email"
              variant="secondary"
              onPress={() => {
                setStep("email")
                setCode("")
              }}
            />
          </>
        )}

        {googleReady ? (
          <GoogleSignInButton
            busy={busy}
            setBusy={setBusy}
            onSuccess={async (idToken) => {
              await signInWithGoogle(idToken)
              router.replace("/(tabs)")
            }}
          />
        ) : (
          <Button
            label="Continue with Google"
            variant="secondary"
            onPress={onGoogleUnavailable}
          />
        )}

        {isExpoGo ? (
          <Body style={{ color: colors.light.textSecondary, fontSize: 13 }}>
            Use email OTP in Expo Go. Google sign-in needs a development build.
          </Body>
        ) : Platform.OS === "web" ? (
          <Body style={{ color: colors.light.textSecondary, fontSize: 13 }}>
            Prefer email OTP on native devices for the full push experience.
          </Body>
        ) : null}
      </View>
    </Screen>
  )
}

function GoogleSignInButton({
  busy,
  setBusy,
  onSuccess,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  onSuccess: (idToken: string) => Promise<void>
}) {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: googleClientIds.ios,
    androidClientId: googleClientIds.android,
    webClientId: googleClientIds.web,
  })

  async function onGoogle() {
    setBusy(true)
    try {
      const result = await promptAsync()
      if (result.type !== "success") return
      const idToken =
        result.params.id_token ??
        (result as { authentication?: { idToken?: string } }).authentication
          ?.idToken
      if (!idToken) {
        throw new Error("Google did not return an ID token")
      }
      await onSuccess(idToken)
    } catch (err) {
      Alert.alert(
        "Google sign-in failed",
        err instanceof Error ? err.message : "Try again"
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      label="Continue with Google"
      variant="secondary"
      loading={busy}
      disabled={!request}
      onPress={() => void onGoogle()}
    />
  )
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.light.bgContainer,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.light.text,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
})
