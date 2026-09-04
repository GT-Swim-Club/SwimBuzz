"use client"

/**
 * Client-only helper for picking a Google Sheet via Google's own Picker
 * dialog. Loads Google's scripts on first use, gets a short-lived OAuth
 * access token via Identity Services, then opens the Picker. The resulting
 * token is handed straight to the backend in the same import request — it's
 * never persisted, so there's no "connect your Google account" step to manage.
 */

type GoogleTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type GoogleTokenClient = {
  requestAccessToken(): void
}

type GooglePickerRecord = Record<string, unknown>

type GooglePickerBuilder = {
  addView(view: unknown): GooglePickerBuilder
  setOAuthToken(token: string): GooglePickerBuilder
  setDeveloperKey(key: string): GooglePickerBuilder
  setCallback(callback: (data: GooglePickerRecord) => void): GooglePickerBuilder
  build(): { setVisible(visible: boolean): void }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: GoogleTokenResponse) => void
          }): GoogleTokenClient
        }
      }
      picker: {
        PickerBuilder: new () => GooglePickerBuilder
        ViewId: { SPREADSHEETS: unknown }
        Response: { ACTION: string; DOCUMENTS: string }
        Action: { PICKED: string; CANCEL: string }
        Document: { ID: string; NAME: string }
      }
    }
    gapi?: {
      load(api: string, options: { callback: () => void; onerror: () => void }): void
    }
  }
}

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
].join(" ")

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

let scriptsPromise: Promise<void> | null = null

/** Idempotent: loads Google Identity Services + the gapi Picker module once. */
export function ensureGoogleScriptsLoaded(): Promise<void> {
  if (!scriptsPromise) {
    scriptsPromise = (async () => {
      await Promise.all([
        loadScript("https://accounts.google.com/gsi/client"),
        loadScript("https://apis.google.com/js/api.js"),
      ])
      await new Promise<void>((resolve, reject) => {
        window.gapi!.load("picker", {
          callback: () => resolve(),
          onerror: () => reject(new Error("Failed to load Google Picker")),
        })
      })
    })().catch((err) => {
      scriptsPromise = null // allow retry on next call
      throw err
    })
  }
  return scriptsPromise
}

export type PickedSpreadsheet = {
  accessToken: string
  spreadsheetId: string
  fileName: string
}

/** Opens Google's consent popup, then the Picker dialog. Resolves null if the user cancels. */
export async function pickSpreadsheet(): Promise<PickedSpreadsheet | null> {
  await ensureGoogleScriptsLoaded()

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
  if (!clientId || !apiKey) {
    throw new Error("Google Picker isn't configured yet — missing client ID or API key.")
  }

  const google = window.google!

  const accessToken = await new Promise<string>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (!response.access_token) {
          reject(new Error(response.error_description || response.error || "Google sign-in was cancelled"))
          return
        }
        resolve(response.access_token)
      },
    })
    tokenClient.requestAccessToken()
  })

  return new Promise<PickedSpreadsheet | null>((resolve) => {
    const picker = new google.picker.PickerBuilder()
      .addView(google.picker.ViewId.SPREADSHEETS)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION]
        if (action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS] as GooglePickerRecord[]
          const doc = docs[0]
          resolve({
            accessToken,
            spreadsheetId: String(doc[google.picker.Document.ID]),
            fileName: String(doc[google.picker.Document.NAME]),
          })
        } else if (action === google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}
