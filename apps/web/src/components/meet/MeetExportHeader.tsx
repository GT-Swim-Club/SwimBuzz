"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { MEET_HEADER, type MeetHeaderDetails } from "@swimbuzz/shared"
import InfoIcon from "@/components/ui/InfoIcon"
import { relayEyebrowClass } from "@/app/meets/[id]/relays/RelayPageHeader"

/** Trims a line's box to its capitals and baseline, so margins between lines are the visible gaps. */
const TRIM_TO_CAPS = "[text-box:trim-both_cap_alphabetic]"
// The header's sizes follow the meet name's, in the proportions every meet header shares.
const TITLE_PX = 38
const EYEBROW_PX = TITLE_PX * MEET_HEADER.eyebrowSize
const DETAILS_PX = TITLE_PX * MEET_HEADER.detailsSize
const ICON_OVERSHOOT_PX = TITLE_PX * MEET_HEADER.iconOvershoot
/** The meet name itself keeps the PNG's own larger size. */
const MEET_NAME_PX = 42
/** As small as a long meet name shrinks to fit the export's width before it wraps instead. */
const MEET_NAME_MIN_PX = 26
/** Details icons at the text size, pulled in to the text's capitals so they don't widen the gaps. */
const DETAILS_ICON_STYLE = { width: DETAILS_PX, height: DETAILS_PX, margin: `${-DETAILS_PX * 0.15}px 0` }

/**
 * A PNG export's meet header, like the PDFs': gold eyebrow, meet name, then date & location, each
 * row trimmed to its capitals and baseline so the gaps between them are the gaps you see, beside
 * the meet icon as tall as all three. It takes the export's width from the content below rather
 * than widening it: a long meet name shrinks to fit, then wraps.
 */
export default function MeetExportHeader({
  eyebrow,
  meetName,
  details,
  iconUrl,
}: {
  eyebrow: string
  meetName: string
  /** Date and location (with the school), under the meet name. */
  details: MeetHeaderDetails
  iconUrl: string | null
}) {
  // The icon spans the header's three rows, reaching past them a little since a round logo that
  // only touches a line looks short of it. Re-measured as the fonts load and change the rows.
  const headerTextRef = useRef<HTMLDivElement>(null)
  const [iconSize, setIconSize] = useState<number | null>(null)
  useLayoutEffect(() => {
    const text = headerTextRef.current
    if (!text) return
    const measure = () => setIconSize(text.getBoundingClientRect().height + ICON_OVERSHOOT_PX * 2)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(text)
    return () => observer.disconnect()
  }, [])

  // The meet name on one line at its full size when it fits, else as much smaller as it needs (down
  // to MEET_NAME_MIN_PX), else wrapped. Set on the element since it depends on the measured width.
  const titleRef = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const title = titleRef.current
    const box = headerTextRef.current
    if (!title || !box) return
    const fit = () => {
      title.style.whiteSpace = "nowrap"
      let size = MEET_NAME_PX
      title.style.fontSize = `${size}px`
      const available = box.clientWidth
      if (available <= 0) return
      // Start from the proportional size, then step down until it truly fits (text doesn't scale
      // exactly linearly, and widths round).
      if (title.scrollWidth > available) {
        size = Math.max(MEET_NAME_MIN_PX, Math.floor((MEET_NAME_PX * available) / title.scrollWidth))
        title.style.fontSize = `${size}px`
      }
      while (title.scrollWidth > available && size > MEET_NAME_MIN_PX) {
        size -= 1
        title.style.fontSize = `${size}px`
      }
      if (title.scrollWidth > available) title.style.whiteSpace = "normal"
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [meetName])

  return (
    // Width 0 growing to the container's: the content below sets the export's width, not the header.
    <div className="flex items-start" style={{ gap: TITLE_PX * MEET_HEADER.iconGap, width: 0, minWidth: "100%" }}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          crossOrigin="anonymous"
          className="h-20 w-20 shrink-0 object-contain"
          style={iconSize ? { width: iconSize, height: iconSize, margin: `-${ICON_OVERSHOOT_PX}px 0` } : undefined}
        />
      ) : null}
      <div ref={headerTextRef} className="min-w-0 flex-1">
        <p className={`${relayEyebrowClass} ${TRIM_TO_CAPS}`} style={{ fontSize: EYEBROW_PX, whiteSpace: "normal" }}>
          {eyebrow}
        </p>
        <h1
          ref={titleRef}
          className={`font-semibold leading-tight text-foreground ${TRIM_TO_CAPS}`}
          style={{ marginTop: TITLE_PX * MEET_HEADER.gapAboveTitle }}
        >
          {meetName}
        </h1>
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-foreground-secondary"
          style={{ fontSize: DETAILS_PX, marginTop: TITLE_PX * MEET_HEADER.gapBelowTitle }}
        >
          <span className="flex items-center gap-1.5">
            <InfoIcon kind="calendar" style={DETAILS_ICON_STYLE} />
            <span className={TRIM_TO_CAPS}>{details.date}</span>
          </span>
          {details.location ? (
            <span className="flex items-center gap-1.5">
              <InfoIcon kind="location" style={DETAILS_ICON_STYLE} />
              <span className={TRIM_TO_CAPS}>{details.location}</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
