"use client"

import { useCallback, useRef, useState } from "react"

export function useMeetResourceUploads() {
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const handlersRef = useRef(new Map<string, (active: boolean) => void>())
  const anyUploading = Object.values(uploading).some(Boolean)

  const setFieldUploading = useCallback((id: string, active: boolean) => {
    setUploading((prev) => {
      if (!active && !prev[id]) return prev
      if (active && prev[id]) return prev
      const next = { ...prev }
      if (active) next[id] = true
      else delete next[id]
      return next
    })
  }, [])

  const getFieldUploadHandler = useCallback(
    (id: string) => {
      let handler = handlersRef.current.get(id)
      if (!handler) {
        handler = (active: boolean) => setFieldUploading(id, active)
        handlersRef.current.set(id, handler)
      }
      return handler
    },
    [setFieldUploading]
  )

  return { anyUploading, getFieldUploadHandler }
}
