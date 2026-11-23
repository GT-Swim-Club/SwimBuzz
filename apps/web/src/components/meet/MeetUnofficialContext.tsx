"use client"

import { createContext, useContext, type CSSProperties, type ReactNode, type Ref } from "react"
import { unofficialLabel } from "@swimbuzz/shared"

type MeetUnofficial = { unofficial: boolean; meetName: string | null }

const MeetUnofficialContext = createContext<MeetUnofficial>({ unofficial: false, meetName: null })

/** Marks every time on an unofficial meet's page ("*22.31") without threading a prop to each row. */
export function MeetUnofficialProvider({
  unofficial,
  meetName,
  children,
}: MeetUnofficial & { children: ReactNode }) {
  return <MeetUnofficialContext.Provider value={{ unofficial, meetName }}>{children}</MeetUnofficialContext.Provider>
}

export function useMeetUnofficial(): MeetUnofficial {
  return useContext(MeetUnofficialContext)
}

/** "Unofficial" pill beside an unofficial meet's name (header, meets list and PNG exports). */
export function UnofficialMeetBadge({
  meetName,
  className = "",
  style,
  ref,
}: {
  meetName?: string | null
  className?: string
  /** Sizes for an export, overriding the pill's own. */
  style?: CSSProperties
  ref?: Ref<HTMLSpanElement>
}) {
  return (
    <span
      ref={ref}
      style={style}
      title={unofficialLabel(meetName)}
      className={`inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent ${className}`}
    >
      Unofficial
    </span>
  )
}
