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
import { ViewSkeleton, type ViewSkeletonVariant } from "@/components/nav/ViewSkeletons"
import HoverDetail from "@/components/ui/HoverDetail"
import { AppIcon } from "@/components/ui/AppIcon"
import { SegmentedToggle, segmentedIconOptionClass } from "@/components/ui/SegmentedToggle"
import { saveListLayout, type ListLayoutPage } from "@/lib/list-layout"

type ViewNavContextValue = {
  isPending: boolean
  pendingView: ViewSkeletonVariant | null
  preview: (view: ViewSkeletonVariant) => void
  navigate: (href: string, view: ViewSkeletonVariant) => void
}

const ViewNavContext = createContext<ViewNavContextValue | null>(null)

export function useViewNav() {
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

  function preview(view: ViewSkeletonVariant) {
    setPendingView(view)
  }

  function navigate(href: string, view: ViewSkeletonVariant) {
    setPendingView(view)
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <ViewNavContext.Provider value={{ isPending, pendingView, preview, navigate }}>
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
  onNavigate,
}: {
  href: string
  view: ViewSkeletonVariant
  active: boolean
  className: string
  children: ReactNode
  title?: string
  /** Runs just before an in-app navigation (not new-tab clicks). */
  onNavigate?: () => void
}) {
  const { navigate, preview, isPending, pendingView } = useViewNav()
  const loading = isPending && pendingView === view

  return (
    <Link
      href={href}
      aria-label={title}
      aria-current={active ? "page" : undefined}
      aria-busy={loading}
      onPointerDown={() => preview(view)}
      onClick={(e) => {
        if (active) {
          e.preventDefault()
          return
        }
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return
        }
        e.preventDefault()
        onNavigate?.()
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

/**
 * Gallery/List links for a server-rendered page. Picking one also saves it as
 * `page`'s layout for next time (see list-layout.ts) — the cookie is written
 * before navigating, so the server render that follows already sees it.
 */
export function GalleryListViewToggle({
  page,
  activeView,
  galleryHref,
  listHref,
  listLinkClassName,
  galleryLinkClassName,
}: {
  page: ListLayoutPage
  activeView: "gallery" | "list"
  galleryHref: string
  listHref: string
  listLinkClassName?: string
  galleryLinkClassName?: string
}) {
  const { pendingView } = useViewNav()
  const shown =
    pendingView === "gallery" || pendingView === "list" ? pendingView : activeView

  return (
    <SegmentedToggle
      selectedIndex={shown === "list" ? 1 : 0}
      className="rounded-lg border border-border bg-background"
    >
      <ViewNavLink
        href={galleryHref}
        view="gallery"
        active={activeView === "gallery"}
        title="Gallery"
        onNavigate={() => saveListLayout(page, "gallery")}
        className={galleryLinkClassName ?? segmentedIconOptionClass(shown === "gallery")}
      >
        <AppIcon name="gallery" className={viewIconClass} />
      </ViewNavLink>
      <ViewNavLink
        href={listHref}
        view="list"
        active={activeView === "list"}
        title="List"
        onNavigate={() => saveListLayout(page, "list")}
        className={listLinkClassName ?? segmentedIconOptionClass(shown === "list")}
      >
        <AppIcon name="list" className={viewIconClass} />
      </ViewNavLink>
    </SegmentedToggle>
  )
}
