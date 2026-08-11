"use client"

import { useState } from "react"
import { formatRelativeTime } from "@/lib/utils"
import ActionIcon from "@/components/ActionIcon"

export type CommentDTO = {
  id: string
  authorName: string
  authorId: string | null
  body: string
  parentId: string | null
  createdAt: string
}

type Thread = CommentDTO & { replies: CommentDTO[] }

function buildThreads(comments: CommentDTO[]): Thread[] {
  const topLevel: Thread[] = []
  const byId = new Map<string, Thread>()

  for (const c of comments) {
    if (!c.parentId) {
      const thread: Thread = { ...c, replies: [] }
      byId.set(c.id, thread)
      topLevel.push(thread)
    }
  }

  for (const c of comments) {
    if (!c.parentId) continue
    const parent = byId.get(c.parentId)
    if (parent) {
      parent.replies.push(c)
    } else {
      // Orphan reply — show as top-level
      const thread: Thread = { ...c, parentId: null, replies: [] }
      byId.set(c.id, thread)
      topLevel.push(thread)
    }
  }

  return topLevel
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
  const [replyTo, setReplyTo] = useState<CommentDTO | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function postComment(text: string, parentId: string | null) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/practices/${practiceId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, parentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to post comment")
        return false
      }
      setComments((c) => [...c, data])
      return true
    } catch {
      setError("Something went wrong")
      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    const ok = await postComment(text, null)
    if (ok) setBody("")
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyTo) return
    const text = replyBody.trim()
    if (!text) return
    const parentId = replyTo.parentId ?? replyTo.id
    const ok = await postComment(text, parentId)
    if (ok) {
      setReplyBody("")
      setReplyTo(null)
    }
  }

  async function handleDelete(id: string) {
    const prev = comments
    setComments((c) => c.filter((x) => x.id !== id && x.parentId !== id))
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" })
    if (!res.ok) setComments(prev)
    if (replyTo?.id === id || replyTo?.parentId === id) {
      setReplyTo(null)
      setReplyBody("")
    }
  }

  function startReply(comment: CommentDTO) {
    setReplyTo(comment)
    setReplyBody("")
    setError(null)
  }

  const threads = buildThreads(comments)

  function CommentBody({ comment }: { comment: CommentDTO }) {
    const canDelete = isCoach || comment.authorId === currentUserId
    return (
      <div className="flex items-start justify-between gap-2 group text-sm">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-foreground dark:text-foreground">
            {comment.authorName}
          </span>
          <span className="ml-2 text-[11px] text-foreground-tertiary dark:text-foreground-tertiary">
            {formatRelativeTime(comment.createdAt)}
          </span>
          <p className="text-foreground-secondary dark:text-foreground-secondary whitespace-pre-line break-words">
            {comment.body}
          </p>
          <button
            type="button"
            onClick={() => startReply(comment)}
            className="mt-0.5 text-[11px] text-foreground-tertiary hover:text-foreground-secondary dark:hover:text-foreground-secondary"
          >
            Reply
          </button>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={() => handleDelete(comment.id)}
            className="shrink-0 text-[11px] text-foreground-tertiary hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            aria-label="Delete comment"
          >
            <ActionIcon kind="delete" className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-foreground-secondary dark:text-foreground-secondary uppercase tracking-wide mb-3">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {threads.length > 0 && (
        <ul className="space-y-3 mb-4">
          {threads.map((thread) => (
            <li key={thread.id}>
              <CommentBody comment={thread} />

              {thread.replies.length > 0 && (
                <ul className="mt-2 ml-4 pl-3 border-l border border-border-secondary space-y-2">
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentBody comment={reply} />
                    </li>
                  ))}
                </ul>
              )}

              {replyTo && (replyTo.id === thread.id || replyTo.parentId === thread.id) && (
                <form onSubmit={handleReply} className="mt-2 ml-4 flex gap-2">
                  <input
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={`Reply to ${replyTo.authorName}…`}
                    autoFocus
                    className="flex-1 rounded-lg border border-border-secondary px-3 py-1.5 text-sm bg-background border-border-secondary"
                  />
                  <button
                    type="submit"
                    disabled={loading || !replyBody.trim()}
                    className="px-3 py-1.5 text-sm border border-border-secondary rounded-lg hover:bg-fill-secondary dark:hover:bg-fill-secondary transition-colors"
                  >
                    {loading ? "…" : "Reply"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(null)
                      setReplyBody("")
                    }}
                    className="px-2 py-1.5 text-sm text-foreground-tertiary hover:text-foreground-secondary dark:hover:text-foreground-secondary"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary"
        />
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="px-4 py-2 text-sm border border-border-secondary rounded-lg hover:bg-fill-secondary dark:hover:bg-fill-secondary transition-colors"
        >
          {loading ? "…" : "Post"}
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </section>
  )
}
