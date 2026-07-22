"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatRelativeTime } from "@/lib/utils"

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  href: string | null
  readAt: string | null
  createdAt: string
}

export default function NotificationsMenu({
  initialNotifications,
}: {
  initialNotifications: NotificationItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNotifications(initialNotifications)
  }, [initialNotifications])

  const unreadCount = notifications.filter((n) => !n.readAt).length

  function closeMenu() {
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu()
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu()
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  async function markRead(id?: string) {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    })
    if (!res.ok) return

    const now = new Date().toISOString()
    setNotifications((prev) =>
      prev.map((n) =>
        id ? (n.id === id && !n.readAt ? { ...n, readAt: now } : n) : { ...n, readAt: n.readAt ?? now }
      )
    )
    router.refresh()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground-secondary transition-colors hover:bg-fill-secondary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-text">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
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
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markRead()}
                  className="text-xs text-primary hover:text-primary-hover"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-foreground-secondary">
                No notifications yet
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {notifications.map((n) => {
                  const content = (
                    <>
                      <p
                        className={`text-sm ${
                          n.readAt
                            ? "font-normal text-foreground-secondary"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-foreground-tertiary">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-foreground-quaternary">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </>
                  )

                  const className = `block px-3 py-2.5 hover:bg-fill-secondary ${
                    !n.readAt ? "bg-primary/10" : ""
                  }`

                  return (
                    <li key={n.id} role="none">
                      {n.href ? (
                        <Link
                          href={n.href}
                          role="menuitem"
                          onClick={() => {
                            void markRead(n.id)
                            closeMenu()
                          }}
                          className={className}
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            void markRead(n.id)
                            closeMenu()
                          }}
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
