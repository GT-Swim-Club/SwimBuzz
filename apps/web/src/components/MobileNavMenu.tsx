"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

type NavLink = {
  href: string
  label: string
  icon: ReactNode
  prefetch?: boolean
}

export default function MobileNavMenu({
  links,
  staffTools,
}: {
  links: NavLink[]
  staffTools?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        aria-label="Open menu"
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-secondary text-foreground transition-colors hover:bg-fill-secondary"
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
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col bg-background-elevated shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border-secondary px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Menu</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-secondary hover:bg-fill-secondary"
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
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <ul className="space-y-0.5">
                {links.map((link) => {
                  const active =
                    pathname === link.href || pathname.startsWith(`${link.href}/`)
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        prefetch={link.prefetch}
                        onClick={() => setOpen(false)}
                        className={
                          "flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] transition-colors " +
                          (active
                            ? "bg-primary-bg font-medium text-primary"
                            : "text-foreground hover:bg-fill-secondary")
                        }
                      >
                        {link.icon}
                        {link.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>

              {staffTools ? (
                <div className="mt-4 space-y-2 border-t border-border-secondary px-1 pt-4">
                  <p className="px-2 text-xs font-medium uppercase tracking-wide text-foreground-tertiary">
                    Staff tools
                  </p>
                  <div className="flex flex-col items-stretch gap-2 px-1">{staffTools}</div>
                </div>
              ) : null}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  )
}
