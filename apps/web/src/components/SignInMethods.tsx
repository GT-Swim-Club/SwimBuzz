"use client"

import { useState } from "react"
import EmailSignInForm from "@/components/EmailSignInForm"
import SignInButton from "@/components/SignInButton"
import { SegmentedToggle, segmentedOptionClass } from "@/components/SegmentedToggle"

type Method = "athletes" | "staff"

export default function SignInMethods({
  callbackUrl,
}: {
  callbackUrl: string
}) {
  const [method, setMethod] = useState<Method>("athletes")

  return (
    <div className="mt-6">
      <SegmentedToggle
        selectedIndex={method === "athletes" ? 0 : 1}
        fullWidth
        className="rounded-lg border border-border-secondary bg-background"
      >
        <button
          type="button"
          role="tab"
          aria-selected={method === "athletes"}
          onClick={() => setMethod("athletes")}
          className={segmentedOptionClass(method === "athletes")}
        >
          Athletes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "staff"}
          onClick={() => setMethod("staff")}
          className={segmentedOptionClass(method === "staff")}
        >
          Coaches & Exec
        </button>
      </SegmentedToggle>

      <div className="mt-5">
        {method === "athletes" ? (
          <EmailSignInForm callbackUrl={callbackUrl} />
        ) : (
          <SignInButton callbackUrl={callbackUrl} />
        )}
      </div>
    </div>
  )
}
