"use client"

import { useState } from "react"
import { nationalsQualifiersPdfFilename } from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { downloadBlob } from "@/components/ui/export-menu"
import { toolbarIconButtonClass } from "@/components/ui/FluidToolbar"

/**
 * "Download PDF" in the Nationals toolbar: the qualifiers as the page shows them (season,
 * gender, grouping and search), laid out server-side like the mobile app's Share PDF.
 */
export default function DownloadQualifiersPdfButton({
  season,
  gender,
  byEvent,
  query,
}: {
  season: string
  gender: "all" | "M" | "F"
  byEvent: boolean
  query: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams({ season })
      if (gender !== "all") params.set("gender", gender)
      if (byEvent) params.set("group", "event")
      if (query) params.set("q", query)
      const res = await fetch(`/api/qualifiers/pdf?${params.toString()}`)
      if (!res.ok) throw new Error("Could not export PDF")
      downloadBlob(await res.blob(), nationalsQualifiersPdfFilename(season))
    } catch {
      setError("Could not export PDF")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        aria-label="Download PDF"
        className={`${toolbarIconButtonClass} disabled:opacity-40`}
      >
        <ActionIcon kind="share" className="h-4 w-4" />
        <HoverDetail label={busy ? "Exporting PDF…" : "Download PDF"} />
      </button>
      {error ? <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-error">{error}</p> : null}
    </div>
  )
}
