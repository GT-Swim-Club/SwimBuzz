import { cookies } from "next/headers"
import {
  LIST_LAYOUT_PAGES,
  listLayoutCookie,
  parseListLayout,
  type ListLayout,
  type ListLayoutPage,
} from "@/lib/list-layout"

/** The List/Gallery layout `page` was last switched to (list if never). */
export async function readListLayout(page: ListLayoutPage): Promise<ListLayout> {
  const store = await cookies()
  return parseListLayout(store.get(listLayoutCookie(page))?.value)
}

/** Every page's saved layout, for SavedListLayoutsProvider in the root layout. */
export async function readListLayouts(): Promise<Record<ListLayoutPage, ListLayout>> {
  const store = await cookies()
  return Object.fromEntries(
    LIST_LAYOUT_PAGES.map((page) => [page, parseListLayout(store.get(listLayoutCookie(page))?.value)])
  ) as Record<ListLayoutPage, ListLayout>
}
