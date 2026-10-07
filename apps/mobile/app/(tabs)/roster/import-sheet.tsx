import { useCallback, useState } from "react"
import { Alert, View } from "react-native"
import * as WebBrowser from "expo-web-browser"
import { useFocusEffect, useRouter } from "expo-router"
import { Button, Chip, Muted, Screen, ScrollView, TextField } from "@swimbuzz/ui"
import { defaultSeason, formatSeasonLabel } from "@swimbuzz/shared"
import { spacing } from "@swimbuzz/tokens"
import { api, WEB_URL } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"

// Google's Picker widget is browser-only — there's no Expo/native equivalent —
// so we open a small hosted page that runs the same picker flow web uses, and
// it deep-links the result back here (same openAuthSessionAsync pattern used
// elsewhere in this app for OAuth).
const PICKER_PAGE_URL = `${WEB_URL}/google-sheets-picker`
const PICKER_DEEP_LINK = "swimbuzz://sheet-picked"

type Picked = { accessToken: string; spreadsheetId: string; fileName: string }
type SheetTab = { gid: number; title: string }

export default function ImportRosterFromSheetScreen() {
  const router = useRouter()
  const tabBarPad = useTabBarScrollPadding()

  const [picked, setPicked] = useState<Picked | null>(null)
  const [tabs, setTabs] = useState<SheetTab[] | null>(null)
  const [selectedGid, setSelectedGid] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)

  const [season, setSeason] = useState("")
  const [seasons, setSeasons] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        try {
          const list = await api.listSeasons()
          if (cancelled) return
          setSeasons(list)
          setSeason((prev) => prev || defaultSeason(list) || "")
        } catch {
          // Season can still be typed manually.
        }
      })()
      return () => {
        cancelled = true
      }
    }, [])
  )

  async function onChoosePicker() {
    setPicking(true)
    try {
      const result = await WebBrowser.openAuthSessionAsync(PICKER_PAGE_URL, PICKER_DEEP_LINK)
      if (result.type !== "success") return // dismissed without picking

      const params = new URL(result.url).searchParams
      const status = params.get("status")
      if (status !== "picked") {
        if (status === "error") Alert.alert("Couldn't open sheet", "Something went wrong. Try again.")
        return
      }

      const accessToken = params.get("accessToken") ?? ""
      const spreadsheetId = params.get("spreadsheetId") ?? ""
      const fileName = params.get("fileName") ?? "Selected sheet"
      if (!accessToken || !spreadsheetId) return

      setPicked({ accessToken, spreadsheetId, fileName })
      setTabs(null)
      setSelectedGid(null)

      const { tabs: sheetTabs } = await api.listSheetTabs({ accessToken, spreadsheetId })
      setTabs(sheetTabs)
      setSelectedGid(sheetTabs[0]?.gid ?? null)
    } catch (err) {
      Alert.alert("Couldn't open Google Drive", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setPicking(false)
    }
  }

  async function onImport() {
    const seasonLabel = season.trim()
    if (!picked || selectedGid == null) {
      Alert.alert("Choose a sheet", "Pick a spreadsheet from Google Drive first.")
      return
    }
    if (!seasonLabel) {
      Alert.alert("Season required", "Enter a season like 2025–2026.")
      return
    }

    setImporting(true)
    try {
      const result = await api.importRosterFromSheet({
        accessToken: picked.accessToken,
        spreadsheetId: picked.spreadsheetId,
        gid: selectedGid,
        season: seasonLabel,
      })
      const parts = [`Imported ${result.created} new athlete${result.created === 1 ? "" : "s"}`]
      if (result.updated > 0) parts.push(`updated ${result.updated}`)
      if (result.errors?.length > 0) parts.push(`${result.errors.length} row(s) skipped`)
      Alert.alert("Import finished", parts.join(" · "), [
        { text: "OK", onPress: () => router.replace("/roster") },
      ])
    } catch (err) {
      Alert.alert(
        "Import failed",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          {!picked ? (
            <>
              <Muted>Choose the roster spreadsheet from your Google Drive.</Muted>
              <Button
                label="Choose from Google Drive"
                loading={picking}
                onPress={() => void onChoosePicker()}
              />
            </>
          ) : (
            <>
              <Muted>Selected: {picked.fileName}</Muted>
              <Button
                label="Change"
                variant="secondary"
                loading={picking}
                onPress={() => void onChoosePicker()}
              />

              {tabs === null ? (
                <Muted>Reading sheet…</Muted>
              ) : tabs.length > 1 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {tabs.map((tab) => (
                    <Chip
                      key={tab.gid}
                      label={tab.title}
                      selected={selectedGid === tab.gid}
                      onPress={() => setSelectedGid(tab.gid)}
                    />
                  ))}
                </View>
              ) : null}

              <TextField
                label="Season"
                value={season}
                onChangeText={setSeason}
                placeholder="2025–2026"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {seasons.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {seasons.map((s) => (
                    <Chip key={s} label={formatSeasonLabel(s)} selected={season === s} onPress={() => setSeason(s)} />
                  ))}
                </View>
              ) : null}

              <Button
                label="Import roster"
                loading={importing}
                onPress={() => void onImport()}
              />
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}
