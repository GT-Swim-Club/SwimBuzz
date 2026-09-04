"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  buildFullPath,
  getBackTarget,
  isSafeInternalPath,
} from "@/lib/navigation-history"

type BackLinkProps = {
  fallbackHref: string
  fallbackLabel: string
  className?: string
}

export default function BackLink({ fallbackHref, fallbackLabel, className }: BackLinkProps) {
  const router = useRouter()
  const [href, setHref] = useState(fallbackHref)
  const [label, setLabel] = useState(fallbackLabel)

  useEffect(() => {
    const current = buildFullPath(
      window.location.pathname,
      window.location.search.replace(/^\?/, "")
    )
    const target = getBackTarget(current)
    if (target && target.href !== current && isSafeInternalPath(target.href)) {
      setHref(target.href)
      setLabel(target.label)
      return
    }
    setHref(fallbackHref)
    setLabel(fallbackLabel)
  }, [fallbackHref, fallbackLabel])

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const current = buildFullPath(
      window.location.pathname,
      window.location.search.replace(/^\?/, "")
    )
    const target = getBackTarget(current)
    const destination =
      target && target.href !== current && isSafeInternalPath(target.href)
        ? target.href
        : href !== fallbackHref
          ? href
          : null

    if (destination) {
      e.preventDefault()
      router.push(destination)
    }
  }

  return (
    <Link href={href} onClick={handleClick} className={className}>
      ← {label}
    </Link>
  )
}
