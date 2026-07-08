"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import Modal, { ModalFooter } from "@/components/Modal"

export default function SignOutButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await signOut({ callbackUrl: "/" })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
      >
        Sign out
      </button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        closeDisabled={loading}
        title="Sign out"
        description="You'll need to sign in again to access the roster, meets, and other team tools."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Signing out…" : "Sign out"}
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Are you sure you want to sign out of SwimBuzz?
        </p>
      </Modal>
    </>
  )
}
