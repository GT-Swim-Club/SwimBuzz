"use client"

import { useState } from "react"
import { formatRelativeTime } from "@/lib/utils"

export type CommentDTO = {
  id: string
  authorName: string
  authorId: string | null
  body: string
  createdAt: string
}

export default function CommentSection({
  practiceId,
  initialComments,
  currentUserId,
  isCoach,
}: {
  practiceId: string
  initialComments: CommentDTO[]
  currentUserId: string
  isCoach: boolean
}) {
  const [comments, setComments] = useState<CommentDTO[]>(initialComments)
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/practices/${practiceId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to post comment")
        return
      }
      setComments((c) => [...c, data])
      setBody("")
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    const prev = comments
    setComments((c) => c.filter((x) => x.id !== id))
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" })
    if (!res.ok) setComments(prev)
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {comments.length > 0 && (
        <ul className="space-y-3 mb-4">
          {comments.map((c) => {
            const canDelete = isCoach || c.authorId === currentUserId
            return (
              <li key={c.id} className="text-sm flex items-start justify-between gap-2 group">
                <div className="min-w-0">
                  <span className="font-medium text-gray-700 dark:text-zinc-200">
                    {c.authorName}
                  </span>
                  <span className="ml-2 text-[11px] text-gray-400 dark:text-zinc-500">
                    {formatRelativeTime(c.createdAt)}
                  </span>
                  <p className="text-gray-600 dark:text-zinc-300 whitespace-pre-line break-words">
                    {c.body}
                  </p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="shrink-0 text-[11px] text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete comment"
                  >
                    Delete
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
        >
          {loading ? "…" : "Post"}
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </section>
  )
}
