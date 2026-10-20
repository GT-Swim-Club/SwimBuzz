import type { ReactNode } from "react"
import ResizableSidebarLayout from "@/components/ui/ResizableSidebarLayout"

/** Two-column meet layout: a resizable ledger sidebar beside the main content. */
export default function MeetLedgerLayout({
  ledger,
  children,
}: {
  ledger: ReactNode
  children: ReactNode
}) {
  return (
    <ResizableSidebarLayout
      sidebar={ledger}
      storageKey="swimbuzz-meet-ledger-width-v2"
      defaultWidth={420}
      minWidth={280}
      maxWidth={640}
    >
      {children}
    </ResizableSidebarLayout>
  )
}
