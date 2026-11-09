import type { RefObject } from "react"
import type { View } from "react-native"
import * as MediaLibrary from "expo-media-library"
import { File, Paths } from "expo-file-system"
import { captureRef } from "react-native-view-shot"
import { rosterSummaryPdfFilename, type RosterSummaryPdfRequest } from "@swimbuzz/shared"
import { API_URL, getAccessToken } from "./api"

/**
 * The request laid out as a PDF by the API (like the web's Download PDF), written to the cache
 * under its export filename, ready for the share sheet.
 */
export async function rosterSummaryPdfFile(
  meetId: string,
  meetName: string,
  request: RosterSummaryPdfRequest
): Promise<File> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}/api/meets/${encodeURIComponent(meetId)}/roster-summary/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  })
  if (!res.ok) throw new Error("Could not create PDF")
  const bytes = new Uint8Array(await res.arrayBuffer())
  const file = new File(Paths.cache, rosterSummaryPdfFilename(meetName, request))
  if (file.exists) file.delete()
  file.write(bytes)
  return file
}

/** Captures the off-screen export view as a PNG into Photos; false when photo access is refused. */
export async function saveCaptureToPhotos(ref: RefObject<View | null>): Promise<boolean> {
  const permission = await MediaLibrary.requestPermissionsAsync(true)
  if (!permission.granted) return false
  const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile" })
  await MediaLibrary.saveToLibraryAsync(uri)
  return true
}
