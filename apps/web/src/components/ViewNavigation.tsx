"use client"

import Link from "next/link"
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { ViewSkeleton, type ViewSkeletonVariant } from "@/components/ViewSkeletons"
import HoverDetail from "@/components/HoverDetail"

type ViewNavContextValue = {
  isPending: boolean
  pendingView: ViewSkeletonVariant | null
  navigate: (href: string, view: ViewSkeletonVariant) => void
}

const ViewNavContext = createContext<ViewNavContextValue | null>(null)

function useViewNav() {
  const ctx = useContext(ViewNavContext)
  if (!ctx) {
    throw new Error("View navigation components must be used within ViewNavigationProvider")
  }
  return ctx
}

export function ViewNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingView, setPendingView] = useState<ViewSkeletonVariant | null>(null)

  useEffect(() => {
    if (!isPending) setPendingView(null)
  }, [isPending])

  function navigate(href: string, view: ViewSkeletonVariant) {
    setPendingView(view)
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <ViewNavContext.Provider value={{ isPending, pendingView, navigate }}>
      {children}
    </ViewNavContext.Provider>
  )
}

const viewIconClass = "h-4 w-4 shrink-0"


export function ViewNavLink({
  href,
  view,
  active,
  className,
  children,
  title,
}: {
  href: string
  view: ViewSkeletonVariant
  active: boolean
  className: string
  children: ReactNode
  title?: string
}) {
  const { navigate, isPending, pendingView } = useViewNav()
  const loading = isPending && pendingView === view

  return (
    <Link
      href={href}
      aria-label={title}
      aria-current={active ? "page" : undefined}
      aria-busy={loading}
      onClick={(e) => {
        if (active) {
          e.preventDefault()
          return
        }
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return
        }
        e.preventDefault()
        navigate(href, view)
      }}
      className={className + " group relative" + (loading ? " opacity-70" : "")}
    >
      {children}
      {title ? <HoverDetail label={title} /> : null}
    </Link>
  )
}

export function ViewNavPanel({ children }: { children: ReactNode }) {
  const { isPending, pendingView } = useViewNav()

  if (isPending && pendingView) {
    return (
      <div aria-busy="true" aria-live="polite">
        <ViewSkeleton variant={pendingView} />
      </div>
    )
  }

  return <>{children}</>
}

const galleryListToggleClass =
  "inline-flex rounded-lg border border-border bg-background p-1 text-sm"

const galleryListLinkClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${
    active
      ? "bg-primary text-primary-text"
      : "text-foreground-secondary hover:bg-fill"
  }`

export function GalleryListViewToggle({
  activeView,
  galleryHref,
  listHref,
  listLinkClassName,
  galleryLinkClassName,
}: {
  activeView: "gallery" | "list"
  galleryHref: string
  listHref: string
  listLinkClassName?: string
  galleryLinkClassName?: string
}) {
  return (
    <div className={galleryListToggleClass}>
      <ViewNavLink
        href={galleryHref}
        view="gallery"
        active={activeView === "gallery"}
        title="Gallery"
        className={galleryLinkClassName ?? galleryListLinkClass(activeView === "gallery")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={viewIconClass}
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </ViewNavLink>
      <ViewNavLink
        href={listHref}
        view="list"
        active={activeView === "list"}
        title="List"
        className={listLinkClassName ?? galleryListLinkClass(activeView === "list")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={viewIconClass}
          aria-hidden="true"
        >
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      </ViewNavLink>
    </div>
  )
}
