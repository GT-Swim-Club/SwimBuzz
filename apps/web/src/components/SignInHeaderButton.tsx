"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function SignInHeaderButton() {
  const pathname = usePathname()
  if (pathname === "/signin") return null

  return (
    <Link
      href="/signin"
      className="inline-flex items-center rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-text transition-colors hover:bg-primary-hover"
    >
      Sign in
    </Link>
  )
}
