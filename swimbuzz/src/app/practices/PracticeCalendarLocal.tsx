"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function getLocalDayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getLocalMonthParam(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function getLocalWeekStartKey(date = new Date()) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  day.setDate(day.getDate() - day.getDay())
  return getLocalDayKey(day)
}

export function TodayButton({
  view,
  query,
  tags,
  currentWeek,
  currentMonth,
  className,
  activeClassName,
}: {
  view: "week" | "month"
  query: string
  tags: string[]
  currentWeek: string
  currentMonth: string
  className: string
  activeClassName: string
}) {
  const [href, setHref] = useState(
    view === "month" ? "/practices?view=month" : "/practices"
  )
  const [isCurrent, setIsCurrent] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    if (query) params.set("q", query)
    for (const tag of tags) params.append("tag", tag)

    if (view === "month") {
      const month = getLocalMonthParam()
      params.set("view", "month")
      params.set("month", month)
      setIsCurrent(currentMonth === month)
    } else {
      const week = getLocalWeekStartKey()
      params.set("week", week)
      setIsCurrent(currentWeek === week)
    }

    const s = params.toString()
    setHref(s ? `/practices?${s}` : "/practices")
  }, [view, query, tags, currentWeek, currentMonth])

  return (
    <Link
      href={href}
      aria-current={isCurrent ? "date" : undefined}
      className={className + (isCurrent ? ` ${activeClassName}` : "")}
    >
      Today
    </Link>
  )
}

export function DayLabel({
  dayKey,
  children,
}: {
  dayKey: string
  children: ReactNode
}) {
  const [isToday, setIsToday] = useState(false)

  useEffect(() => {
    setIsToday(dayKey === getLocalDayKey())
  }, [dayKey])

  if (!isToday) {
    return (
      <span className="text-xs font-medium text-foreground-secondary">
        {children}
      </span>
    )
  }

  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-text">
      {children}
    </span>
  )
}

export function PracticeCardShell({
  dayKey,
  href,
  className,
  todayClassName,
  children,
}: {
  dayKey: string
  href: string
  className?: string
  todayClassName?: string
  children: ReactNode
}) {
  const [isToday, setIsToday] = useState(false)

  useEffect(() => {
    setIsToday(dayKey === getLocalDayKey())
  }, [dayKey])

  return (
    <Link
      href={href}
      className={(className ?? "") + (isToday && todayClassName ? ` ${todayClassName}` : "")}
    >
      {children}
    </Link>
  )
}
