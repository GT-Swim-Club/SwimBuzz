import type { ReactNode } from "react"
import ResizableSidebarLayout from "@/components/ui/ResizableSidebarLayout"

/**
 * Two-column meet layout: a resizable ledger sidebar beside the main content (the roster summary).
 * Stacked on a phone (≤900px) it reads `lead` (the highlights), then the main content, then the rest
 * of the ledger — the summary is what people come for during a meet, so it doesn't wait under every
 * logistics card. `lead` sits at the top of the sidebar on wider screens.
 */
export default function MeetLedgerLayout({
  lead,
  ledger,
  children,
}: {
  lead?: ReactNode
  ledger: ReactNode
  children: ReactNode
}) {
  return (
    <ResizableSidebarLayout
      sidebar={
        <>
          {lead ? <div className="flex flex-col max-[900px]:hidden">{lead}</div> : null}
          {ledger}
        </>
      }
      storageKey="swimbuzz-meet-ledger-width-v2"
      defaultWidth={420}
      minWidth={280}
      maxWidth={640}
      sidebarClassName="gap-4 max-[900px]:order-2 max-[900px]:mt-8"
      mainClassName="gap-8 max-[900px]:order-1 max-[900px]:!mt-0"
    >
      {lead ? <div className="flex flex-col min-[901px]:hidden">{lead}</div> : null}
      {children}
    </ResizableSidebarLayout>
  )
}
