"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="w-20 h-7" /> // placeholder to avoid layout shift
  }

  return (
    <select
      value={theme}
      onChange={e => setTheme(e.target.value)}
      className="text-xs border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300"
    >
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="system">System</option>
    </select>
  )
}