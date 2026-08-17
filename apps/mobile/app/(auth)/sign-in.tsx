import { useMemo, useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import Constants from "expo-constants"
import { Redirect, useRouter } from "expo-router"
import * as Google from "expo-auth-session/providers/google"
import * as WebBrowser from "expo-web-browser"
import Svg, { Path } from "react-native-svg"
import { Button, Screen, ScrollView, usePalette } from "@swimbuzz/ui"
import { spacing, type ColorPalette } from "@swimbuzz/tokens"
import { useAuth } from "../../src/lib/auth"
import { useThemePreference } from "../../src/lib/theme"
import { SegmentedOption, SegmentedToggle } from "../../src/components/SegmentedToggle"

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
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const styles = useMemo(() => makeStyles(c), [c])
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [busy, setBusy] = useState(false)
  const [method, setMethod] = useState<"athletes" | "staff">("athletes")
  const [emailFocused, setEmailFocused] = useState(false)
  const [codeFocused, setCodeFocused] = useState(false)

  if (!loading && user) return <Redirect href="/practices" />

  async function onRequestCode() {
    setBusy(true)
    try {
      await requestCode(email.trim())
      setStep("code")
      setCode("")
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
      router.replace("/practices")
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
        "Google blocks OAuth inside Expo Go. Switch to Athletes and use the email code, or run a development build with separate iOS/Android OAuth client IDs."
      )
      return
    }
    Alert.alert(
      "Google sign-in",
      "Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / ANDROID / WEB_CLIENT_ID in apps/mobile/.env. Use native OAuth clients from Google Cloud Console — not the web client ID for iOS/Android."
    )
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              to access GTSC roster, meets, and practice tools
            </Text>
          </View>

          <SegmentedToggle
            appearance="glass"
            selectedIndex={method === "staff" ? 1 : 0}
            fill
            style={{ alignSelf: "stretch", marginBottom: spacing.md }}
          >
            <SegmentedOption
              flex
              selected={method === "athletes"}
              accessibilityLabel="Athletes"
              onPress={() => setMethod("athletes")}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  method === "athletes" && styles.toggleLabelSelected,
                ]}
              >
                Athletes
              </Text>
            </SegmentedOption>
            <SegmentedOption
              flex
              selected={method === "staff"}
              accessibilityLabel="Coaches and Exec"
              onPress={() => setMethod("staff")}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  method === "staff" && styles.toggleLabelSelected,
                ]}
              >
                Coaches & Exec
              </Text>
            </SegmentedOption>
          </SegmentedToggle>

          {method === "athletes" ? (
            step === "email" ? (
              <View style={styles.form}>
                <Text style={styles.label}>Georgia Tech Email</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  keyboardAppearance={colorScheme}
                  placeholder="gburdell3@gatech.edu"
                  placeholderTextColor={c.textTertiary}
                  style={[styles.input, emailFocused && styles.inputFocused]}
                  value={email}
                  onBlur={() => setEmailFocused(false)}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                />
                <Button
                  label="Send verification code"
                  loading={busy}
                  disabled={!email.trim()}
                  onPress={() => void onRequestCode()}
                  style={styles.action}
                />
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>Verification code</Text>
                <Text style={styles.hint}>
                  We sent a 6-digit code to{" "}
                  <Text style={styles.hintEmphasis}>{email}</Text>
                </Text>
                <TextInput
                  keyboardType="number-pad"
                  keyboardAppearance={colorScheme}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="000000"
                  placeholderTextColor={c.textTertiary}
                  style={[
                    styles.input,
                    styles.codeInput,
                    codeFocused && styles.inputFocused,
                  ]}
                  value={code}
                  onBlur={() => setCodeFocused(false)}
                  onChangeText={(value) =>
                    setCode(value.replace(/\D/g, "").slice(0, 6))
                  }
                  onFocus={() => setCodeFocused(true)}
                  maxLength={6}
                />
                <Button
                  label="Verify and sign in"
                  loading={busy}
                  disabled={code.length !== 6}
                  onPress={() => void onVerify()}
                  style={styles.action}
                />
                <View style={styles.codeActions}>
                  <Pressable
                    onPress={() => {
                      setStep("email")
                      setCode("")
                    }}
                  >
                    <Text style={styles.link}>← Use a different email</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => void onRequestCode()}>
                    <Text style={styles.link}>Resend code</Text>
                  </Pressable>
                </View>
              </View>
            )
          ) : (
            <>
              {googleReady ? (
                <GoogleSignInButton
                  busy={busy}
                  setBusy={setBusy}
                  onSuccess={async (idToken) => {
                    await signInWithGoogle(idToken)
                    router.replace("/practices")
                  }}
                />
              ) : (
                <Button
                  label="Continue with Google"
                  variant="secondary"
                  icon={<GoogleMark />}
                  onPress={onGoogleUnavailable}
                  style={styles.action}
                />
              )}
              {isExpoGo ? (
                <Text style={styles.footnote}>
                  Use email OTP on the Athletes tab. Google sign-in needs a
                  development build.
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
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
      icon={<GoogleMark />}
      loading={busy}
      disabled={!request}
      onPress={() => void onGoogle()}
      style={{ minHeight: 48, borderRadius: 12 }}
    />
  )
}

function withAlpha(hex: string, alpha: number) {
  const raw = hex.replace("#", "")
  const n =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw
  const r = Number.parseInt(n.slice(0, 2), 16)
  const g = Number.parseInt(n.slice(2, 4), 16)
  const b = Number.parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    screen: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
    flex: { flex: 1 },
    content: { flexGrow: 1, paddingBottom: spacing.xl },
    header: { alignItems: "center", marginBottom: spacing.md },
    title: {
      color: c.text,
      fontSize: 24,
      fontWeight: "600",
      letterSpacing: -0.3,
      textAlign: "center",
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: spacing.sm,
      textAlign: "center",
    },
    toggleLabel: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: "500",
      textAlign: "center",
    },
    toggleLabelSelected: { color: c.primaryText, fontWeight: "600" },
    form: { gap: spacing.sm },
    label: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: "500",
    },
    hint: { color: c.textTertiary, fontSize: 12, lineHeight: 18 },
    hintEmphasis: { color: c.text, fontWeight: "600" },
    input: {
      backgroundColor: c.bgElevated,
      borderColor: c.border,
      borderRadius: 12,
      borderWidth: 1,
      color: c.text,
      fontSize: 16,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    inputFocused: {
      borderColor: c.primary,
      boxShadow: `0px 0px 0px 3px ${withAlpha(c.primary, 0.34)}`,
    },
    codeInput: {
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: 20,
      letterSpacing: 8,
      textAlign: "center",
    },
    action: { borderRadius: 12, minHeight: 48 },
    codeActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.xs,
    },
    link: { color: c.textTertiary, fontSize: 12 },
    footnote: {
      color: c.textTertiary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: spacing.md,
      textAlign: "center",
    },
  })
}
