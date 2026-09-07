"use client"

import { useRef, useState } from "react"
import {
  NOTIFICATION_PREFERENCE_META,
  type NotificationPreferences,
  type AllPreferenceKey,
} from "@/lib/notifications/notification-preferences"
import { updateNotificationPreference } from "./NotificationPreferencesSettings.actions"

export default function NotificationPreferencesSettings({
  initialPreferences,
  isAthlete = false,
  isMeetDirector = false,
}: {
  initialPreferences: NotificationPreferences
  isAthlete?: boolean
  isMeetDirector?: boolean
}) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [error, setError] = useState<string | null>(null)
  const [isSignupTimesOpen, setIsSignupTimesOpen] = useState(false)
  const lastSaved = useRef(initialPreferences)
  const requestGen = useRef<Partial<Record<AllPreferenceKey, number>>>({})

  function updatePreference(key: AllPreferenceKey, value: boolean | number | number[]) {
    setPreferences((prev) => ({ ...prev, [key]: value }))
    setError(null)
    const gen = (requestGen.current[key] ?? 0) + 1
    requestGen.current[key] = gen

    void (async () => {
      try {
        const preferences = await updateNotificationPreference(key, value)
        if (requestGen.current[key] !== gen) return
        lastSaved.current = {
          ...lastSaved.current,
          [key]: preferences[key],
        }
      } catch (err) {
        if (requestGen.current[key] !== gen) return
        setPreferences((prev) => ({ ...prev, [key]: lastSaved.current[key] }))
        setError(err instanceof Error ? err.message : "Couldn’t save notification preference")
      }
    })()
  }

  return (
    <div className="divide-y divide-border">
      {NOTIFICATION_PREFERENCE_META.filter(
        ({ athletesOnly, meetDirectorsOnly }) =>
          (!athletesOnly || isAthlete) && (!meetDirectorsOnly || isMeetDirector)
      ).map(({ key, label, description, athleteDescription }) => (
          <div key={key}>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">{label}</p>
                <p className="text-xs text-foreground-secondary">
                  {isAthlete && athleteDescription
                    ? athleteDescription
                    : description}
                </p>
              </div>
              {key === "meetSignupOpen" ? (
                <div className="relative">
                  <button
                    type="button"
                    className={`w-38 border rounded-lg px-2 py-1.5 text-xs text-left flex justify-between items-center ${
                      preferences.meetSignupNotificationTimes?.length
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border bg-background"
                    }`}
                    onClick={() => setIsSignupTimesOpen(!isSignupTimesOpen)}
                  >
                    <span>
                      {preferences.meetSignupNotificationTimes?.length
                        ? `${preferences.meetSignupNotificationTimes.length} selected`
                        : "Select times..."}
                    </span>
                    <span>{isSignupTimesOpen ? "▲" : "▼"}</span>
                  </button>
                  {isSignupTimesOpen && (
                    <div className="absolute top-full right-0 z-10 w-38 mt-1 border border-border rounded-lg bg-background shadow-lg p-1">
                      {[0, 5, 10, 15, 30, 45, 60].map((m) => {
                        const isSelected = preferences.meetSignupNotificationTimes?.includes(m)
                        return (
                          <div
                            key={m}
                            className={`cursor-pointer px-2 py-1 text-xs rounded ${
                              isSelected ? "bg-primary text-primary-foreground" : "hover:bg-fill-secondary"
                            }`}
                            onClick={() => {
                              const currentTimes = preferences.meetSignupNotificationTimes ?? []
                              const nextTimes = isSelected
                                ? currentTimes.filter((t) => t !== m)
                                : [...currentTimes, m]
                              updatePreference("meetSignupNotificationTimes", nextTimes)
                            }}
                          >
                            {m === 0 ? "When signups open" : `${m}m before`}
                            {isSelected && " ✓"}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences[key]}
                  aria-label={label}
                  onClick={() => updatePreference(key, !preferences[key])}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    preferences[key] ? "bg-primary" : "bg-fill-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow transition-transform ${
                      preferences[key]
                        ? "bg-background translate-x-5"
                        : "bg-primary translate-x-0"
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        )
      )}
      {error ? (
        <p className="px-4 py-2 text-xs text-error">{error}</p>
      ) : null}
    </div>
  )
}
