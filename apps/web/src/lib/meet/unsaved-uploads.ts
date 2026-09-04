"use client"

import { useCallback, useEffect, useRef } from "react"
import { isStoredMeetFileUrl } from "@/lib/meet/meet-files"

/** Delete a stored meet upload, icon, or banner. Ignores external URLs. */
export function deleteStoredUpload(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return Promise.resolve()

  let endpoint: string | null = null
  if (trimmed.includes("/storage/v1/object/public/meet-icons/")) {
    endpoint = "/api/meets/icon"
  } else if (trimmed.includes("/storage/v1/object/public/meet-banners/")) {
    endpoint = "/api/meets/banner"
  } else if (isStoredMeetFileUrl(trimmed)) {
    endpoint = "/api/meets/upload"
  }
  if (!endpoint) return Promise.resolve()

  return fetch(endpoint, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: trimmed }),
  }).then(
    () => undefined,
    () => undefined
  )
}

/**
 * Track files uploaded during a modal session. Call `begin()` when the modal
 * opens, `trackUpload` after each successful upload, and `release(keep)` on
 * close or save. URLs not in `keep` are deleted from storage.
 */
export function useUnsavedUploads() {
  const uploadedRef = useRef(new Set<string>())
  const activeRef = useRef(false)

  const begin = useCallback(() => {
    activeRef.current = true
  }, [])

  const trackUpload = useCallback((url: string) => {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!activeRef.current) {
      void deleteStoredUpload(trimmed)
      return
    }
    uploadedRef.current.add(trimmed)
  }, [])

  const release = useCallback((keepUrls: Iterable<string> = []) => {
    activeRef.current = false
    const keep = new Set(
      [...keepUrls].map((url) => url.trim()).filter(Boolean)
    )
    const toDelete = [...uploadedRef.current].filter((url) => !keep.has(url))
    uploadedRef.current.clear()
    if (toDelete.length === 0) return
    void Promise.all(toDelete.map(deleteStoredUpload))
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      const toDelete = [...uploadedRef.current]
      uploadedRef.current.clear()
      if (toDelete.length === 0) return
      void Promise.all(toDelete.map(deleteStoredUpload))
    }
  }, [])

  return { begin, trackUpload, release }
}
