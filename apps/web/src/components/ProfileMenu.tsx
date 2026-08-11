"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { signOut } from "next-auth/react"
import Modal, { ModalFooter } from "@/components/Modal"
import { ATHLETE_VIEW_COOKIE } from "@/lib/athlete-view"

function initialsFromName(name?: string | null, email?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  const local = (email ?? "").split("@")[0]
  return (local.slice(0, 2) || "?").toUpperCase()
}

export default function ProfileMenu({
  name,
  email,
  image,
  roleLabel,
  rosterProfileHref,
  swimCloudProfileHref,
}: {
  name?: string | null
  email?: string | null
  image?: string | null
  roleLabel: string
  rosterProfileHref: string | null
  swimCloudProfileHref: string | null
}) {
  const [open, setOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const initials = initialsFromName(name, email)

  async function handleSignOut() {
    setSigningOut(true)
    document.cookie = `${ATHLETE_VIEW_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    await signOut({ callbackUrl: "/" })
  }

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function openMenu() {
    clearCloseTimer()
    setOpen(true)
  }

  function scheduleClose() {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  function closeMenu() {
    clearCloseTimer()
    setOpen(false)
  }

  useEffect(() => () => clearCloseTimer(), [])

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

  return (
    <>
      <div
        ref={rootRef}
        className="relative"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Open profile menu"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border-secondary bg-primary/10 text-sm font-medium text-primary transition-opacity hover:opacity-90"
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span aria-hidden>{initials}</span>
          )}
        </button>

        {open ? (
          <div className="absolute right-0 z-50 pt-2">
            <div
              role="menu"
              className="w-56 overflow-hidden rounded-xl border border-border-secondary bg-background shadow-lg"
            >
              <div className="border-b border-border-secondary px-3 py-2.5">
                <p className="truncate text-sm font-medium text-foreground">
                  {name || "Account"}
                </p>
                <p className="truncate text-xs text-foreground-secondary">
                  {email || roleLabel}
                </p>
                {email ? (
                  <p className="mt-0.5 truncate text-xs text-foreground-tertiary">
                    {roleLabel}
                  </p>
                ) : null}
              </div>

              <div className="py-1">
                {rosterProfileHref ? (
                  <Link
                    href={rosterProfileHref}
                    role="menuitem"
                    onClick={closeMenu}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-secondary hover:bg-fill-secondary"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 shrink-0 text-foreground-tertiary"
                      aria-hidden
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    Profile
                  </Link>
                ) : null}
                {swimCloudProfileHref ? (
                  <a
                    href={swimCloudProfileHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={closeMenu}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-secondary hover:bg-fill-secondary"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 shrink-0 text-foreground-tertiary"
                      aria-hidden
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" x2="21" y1="14" y2="3" />
                    </svg>
                    SwimCloud Profile
                  </a>
                ) : null}
                <Link
                  href="/settings"
                  role="menuitem"
                  onClick={closeMenu}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-secondary hover:bg-fill-secondary"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-foreground-tertiary"
                    aria-hidden
                  >
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Settings
                </Link>
              </div>

              <div className="border-t border-border-secondary py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu()
                    setSignOutOpen(true)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-fill-secondary"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-foreground-tertiary"
                    aria-hidden
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" x2="9" y1="12" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={signOutOpen}
        onClose={() => !signingOut && setSignOutOpen(false)}
        closeDisabled={signingOut}
        title="Sign Out"
        description="You'll need to sign in again to access the roster, meets, and other team tools."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setSignOutOpen(false)}
              disabled={signingOut}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {signingOut ? "Signing Out…" : "Sign Out"}
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-foreground-secondary">
          Are you sure you want to sign out of SwimBuzz?
        </p>
      </Modal>
    </>
  )
}
