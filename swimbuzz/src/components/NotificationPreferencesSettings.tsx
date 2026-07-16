"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  NOTIFICATION_PREFERENCE_META,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@/lib/notification-preferences"

export default function NotificationPreferencesSettings({
  initialPreferences,
}: {
  initialPreferences: NotificationPreferences
}) {
  const router = useRouter()
  const [preferences, setPreferences] = useState(initialPreferences)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(key: NotificationPreferenceKey) {
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    setError(null)

    startTransition(async () => {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      })
      if (!res.ok) {
        setPreferences(preferences)
        const data = await res.json().catch(() => null)
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Couldn’t save notification preference"
        )
        return
      }
      const data = (await res.json()) as { preferences: NotificationPreferences }
      setPreferences(data.preferences)
      router.refresh()
    })
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-zinc-800">
      {NOTIFICATION_PREFERENCE_META.map(({ key, label, description }) => (
        <div
          key={key}
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <div>
            <p className="text-sm text-gray-900 dark:text-zinc-100">{label}</p>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              {description}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences[key]}
            aria-label={label}
            disabled={pending}
            onClick={() => toggle(key)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              preferences[key]
                ? "bg-indigo-600"
                : "bg-gray-200 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                preferences[key] ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      ))}
      {error ? (
        <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  )
}
