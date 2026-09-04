"use client"

/**
 * Minimal hosted page the mobile app opens via expo-web-browser's
 * openAuthSessionAsync (same mechanism used for OAuth elsewhere in the app).
 * Runs the same Google Picker flow as the web Import Roster modal, then
 * deep-links the result back into the app — mobile has no native equivalent
 * of Google's Picker widget, so this page is the bridge.
 */

import { useState } from "react"
import { pickSpreadsheet } from "@/lib/roster/google-picker-client"

const MOBILE_DEEP_LINK = "swimbuzz://sheet-picked"

export default function GoogleSheetsPickerPage() {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePick() {
    setPicking(true)
    setError(null)
    try {
      const picked = await pickSpreadsheet()
      if (!picked) {
        window.location.href = `${MOBILE_DEEP_LINK}?status=cancelled`
        return
      }
      const params = new URLSearchParams({
        status: "picked",
        accessToken: picked.accessToken,
        spreadsheetId: picked.spreadsheetId,
        fileName: picked.fileName,
      })
      window.location.href = `${MOBILE_DEEP_LINK}?${params.toString()}`
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setPicking(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Import roster from Google Sheets</h1>
        <p className="text-sm text-foreground-secondary">
          Choose the spreadsheet you want to import from your Google Drive.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handlePick()}
        disabled={picking}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
      >
        {picking ? "Opening…" : "Choose spreadsheet"}
      </button>
      {error && <p className="max-w-sm text-sm text-error">{error}</p>}
    </div>
  )
}
