"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

type ImportResult = {
  meetName: string | null
  parsed: number
  matched: number
  imported: number
  unmatched: number
}

export default function ImportMeetButton() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setStatus("loading")
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch("/api/meets/import", {
      method: "POST",
      body: formData,
    })

    const data = await res.json()
    if (!res.ok) {
      setStatus("error")
      setError(data.error ?? "Import failed")
      return
    }

    setResult(data)
    setStatus("done")
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".hy3,.cl2,.sd3"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === "loading"}
        className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
      >
        {status === "loading" ? "Importing..." : "Import meet results"}
      </button>
      {status === "done" && result && (
        <span className="text-xs text-gray-500 dark:text-zinc-400">
          {result.imported} swims imported
          {result.unmatched > 0 && ` · ${result.unmatched} unmatched`}
        </span>
      )}
      {status === "error" && (
        <span className="text-xs text-red-500">{error ?? "Import failed"}</span>
      )}
    </div>
  )
}
