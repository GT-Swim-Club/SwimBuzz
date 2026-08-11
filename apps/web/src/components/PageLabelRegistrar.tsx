"use client"

import { useEffect } from "react"
import { setCurrentPageLabel } from "@/lib/navigation-history"

export default function PageLabelRegistrar({ label }: { label: string }) {
  useEffect(() => {
    setCurrentPageLabel(label)
  }, [label])

  return null
}
