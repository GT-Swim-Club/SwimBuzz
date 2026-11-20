"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { isUnseenNotification } from "@swimbuzz/shared"
import { formatDateTime, formatRelativeTime } from "@/lib/utils"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { useEscapeToClose } from "@/lib/use-escape-to-close"

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  href: string | null
  readAt: string | null
  seenAt: string | null
  createdAt: string
}

/** How often the closed bell checks for new notifications while the tab is in view. */
const POLL_MS = 60_000

export default function NotificationsMenu({
  initialNotifications,
}: {
  initialNotifications: NotificationItem[]
}) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  // Spinner only until the first fetch finishes; later opens show the list
  // immediately and refresh it in the background.
  const [loaded, setLoaded] = useState(false)
  const [prevInitial, setPrevInitial] = useState(initialNotifications)
  // What was unread when the menu opened: shown as new for as long as it stays open, though
  // opening marks everything read.
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)

  // Only resync when the server actually sends a new list; reads are local +
  // API-only, so re-applying the original prop would bring back stale state.
  if (initialNotifications !== prevInitial) {
    setPrevInitial(initialNotifications)
    setNotifications(initialNotifications)
  }

  // The badge counts what arrived since the list was last opened. Opening it marks everything
  // read (clearing the badge), while what was new stays highlighted until the menu closes.
  const unseenCount = notifications.filter(isUnseenNotification).length

  function unreadIds(list: NotificationItem[]) {
    return list.filter((n) => !n.readAt).map((n) => n.id)
  }

  function openMenu() {
    setNewIds(new Set(unreadIds(notifications)))
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
  }

  useEscapeToClose(open, closeMenu)

  const refresh = useCallback(async (): Promise<NotificationItem[] | null> => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      if (!res.ok) return null
      const data: { notifications: NotificationItem[] } = await res.json()
      setNotifications(data.notifications)
      return data.notifications
    } catch {
      return null
    }
  }, [])

  // The bell lives in the root layout, which doesn't re-render on client
  // navigation — poll while the tab is visible, and catch up when it's back.
  useEffect(() => {
    if (open) return
    const tick = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const timer = window.setInterval(tick, POLL_MS)
    window.addEventListener("focus", tick)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", tick)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [open, refresh])

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function syncNotifications() {
      // Fetch first so anything that arrived since the last poll is highlighted too, then mark
      // the whole list read.
      const fresh = await refresh()
      if (cancelled) return
      if (fresh) setNewIds((prev) => new Set([...prev, ...unreadIds(fresh)]))
      const ok = await patchNotifications({ all: true })
        .then((res) => res.ok)
        .catch(() => false)
      if (cancelled || !ok) return
      const now = new Date().toISOString()
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? now, seenAt: n.seenAt ?? now }))
      )
    }
    void syncNotifications().finally(() => {
      if (!cancelled) setLoaded(true)
    })

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu()
      }
    }

    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      cancelled = true
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open, refresh])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unseenCount > 0
            ? `Notifications, ${unseenCount} new`
            : "Notifications"
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground-secondary transition-colors hover:bg-background-hover"
      >
        <AppIcon name="bell" className="h-5 w-5" />
        {unseenCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-contrast">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        ) : null}
        {open ? null : <HoverDetail label="Notifications" />}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 pt-2">
          <div
            role="menu"
            className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-background shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <p className="text-sm font-medium text-foreground">
                Notifications
              </p>
            </div>
            {!loaded ? (
              <div
                role="status"
                aria-label="Loading notifications"
                className="flex justify-center px-3 py-6"
              >
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-foreground-secondary">
                No notifications yet
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {notifications.map((n) => {
                  const unread = newIds.has(n.id)
                  const content = (
                    <div className="flex gap-2">
                      <span
                        aria-hidden
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-primary" : ""}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            unread
                              ? "font-semibold text-foreground"
                              : "font-normal text-foreground-secondary"
                          }`}
                        >
                          {unread ? <span className="sr-only">New: </span> : null}
                          {n.title}
                        </p>
                        {n.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-foreground-tertiary">
                            {n.body}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-foreground-tertiary">
                          <span className="group relative inline-block" tabIndex={0}>
                            {formatRelativeTime(n.createdAt)}
                            <HoverDetail label={formatDateTime(n.createdAt)} />
                          </span>
                        </p>
                      </div>
                    </div>
                  )

                  const className = "block px-3 py-2.5 transition-colors hover:bg-background-hover"

                  return (
                    <li key={n.id} role="none">
                      {n.href ? (
                        <Link
                          href={n.href}
                          role="menuitem"
                          onClick={closeMenu}
                          className={className}
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={closeMenu}
                          className={`w-full text-left ${className}`}
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function patchNotifications(body: { all: true }) {
  return fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
