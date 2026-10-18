import { cookies } from "next/headers"
import { listLayoutCookie, parseListLayout, type ListLayout, type ListLayoutPage } from "@/lib/list-layout"

/** The List/Gallery layout `page` was last switched to (list if never). */
export async function readListLayout(page: ListLayoutPage): Promise<ListLayout> {
  const store = await cookies()
  return parseListLayout(store.get(listLayoutCookie(page))?.value)
}
