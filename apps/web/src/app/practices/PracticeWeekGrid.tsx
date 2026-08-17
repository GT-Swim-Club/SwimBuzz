import type { ReactNode } from "react"

export default function PracticeWeekGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[18rem] flex-1 grid-cols-7 md:min-h-0">{children}</div>
}
