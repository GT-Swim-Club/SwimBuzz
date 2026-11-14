"use client"

import Link from "next/link"
import { toolbarButtonClass } from "@/components/ui/FluidToolbar"
import { WarningGlyph } from "@/components/athlete/ClearanceFlag"

/** Staff roster toolbar: open the season's physical & concussion clearance list. */
export default function ClearanceLinkButton({ season }: { season: string }) {
  return (
    <Link
      href={`/athletes/clearance?season=${encodeURIComponent(season)}`}
      aria-label="Physical & concussion clearance"
      className={toolbarButtonClass}
    >
      <WarningGlyph className="h-4 w-4 shrink-0" />
      Clearance
    </Link>
  )
}
