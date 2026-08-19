"use client"

import { useMemo, useState } from "react"
import HoverDetail from "@/components/HoverDetail"
import ActionIcon from "@/components/ActionIcon"
import InfoIcon from "@/components/InfoIcon"
import StaffBadge from "@/components/StaffBadge"
import type { StaffTitle } from "@swimbuzz/shared"
import { formatDateTime, formatRelativeTime } from "@/lib/utils"

export type CommentDTO = {
  id: string
  authorName: string
  authorId: string | null
  authorImage: string | null
  authorStaffTitle: StaffTitle | null
  body: string
  parentId: string | null
  createdAt: string
}

type Thread = CommentDTO & { replies: CommentDTO[] }

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return "?"
}

function CommentAvatar({ name, image }: { name: string; image: string | null }) {
  return (
    <div
      className="relative flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-secondary bg-primary/10 text-[10px] font-medium text-primary"
      aria-label={`${name}'s profile picture`}
    >
      <span aria-hidden>{initialsFromName(name)}</span>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none"
          }}
        />
      ) : null}
    </div>
  )
}

function CommentLoadingOverlay() {
  return (
    <div
      role="status"
      aria-label="Submitting comment"
      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80"
    >
      <span
        aria-hidden
        className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />
    </div>
  )
}

function buildThreads(comments: CommentDTO[]): Thread[] {
  const topLevel: Thread[] = []
  const byId = new Map<string, Thread>()

  for (const comment of comments) {
    if (!comment.parentId) {
      const thread: Thread = { ...comment, replies: [] }
      byId.set(comment.id, thread)
      topLevel.push(thread)
    }
  }

  for (const comment of comments) {
    if (!comment.parentId) continue
    const parent = byId.get(comment.parentId)
    if (parent) {
      parent.replies.push(comment)
    } else {
      const thread: Thread = { ...comment, parentId: null, replies: [] }
      byId.set(comment.id, thread)
      topLevel.push(thread)
    }
  }

  return topLevel
}

function AttendedBadge() {
  return (
    <span className="group relative ml-1.5 inline-flex translate-y-[1px] items-center text-primary">
      <InfoIcon kind="attended" />
      <span className="sr-only">Attended</span>
      <HoverDetail label="Attended" />
    </span>
  )
}

export default function CommentSection({
  practiceId,
  initialComments,
  currentUserId,
  isCoach,
  attendedUserIds,
}: {
  practiceId: string
  initialComments: CommentDTO[]
  currentUserId: string
  isCoach: boolean
  attendedUserIds: string[]
}) {
  const attendedUsers = useMemo(() => new Set(attendedUserIds), [attendedUserIds])
  const [comments, setComments] = useState<CommentDTO[]>(initialComments)
  const [body, setBody] = useState("")
  const [replyTo, setReplyTo] = useState<CommentDTO | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [editingComment, setEditingComment] = useState<CommentDTO | null>(null)
  const [editBody, setEditBody] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
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
      setComments((current) => [...current, data])
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

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingComment) return
    const text = editBody.trim()
    if (!text || text === editingComment.body) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/comments/${editingComment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to update comment")
        return
      }
      setComments((current) =>
        current.map((comment) =>
          comment.id === data.id ? { ...comment, ...data } : comment
        )
      )
      setEditingComment(null)
      setEditBody("")
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleteConfirmId(null)
    const previous = comments
    setComments((current) =>
      current.filter(
        (comment) => comment.id !== id && comment.parentId !== id
      )
    )
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" })
    if (!res.ok) setComments(previous)
    if (replyTo?.id === id || replyTo?.parentId === id) {
      setReplyTo(null)
      setReplyBody("")
    }
    if (editingComment?.id === id || editingComment?.parentId === id) {
      setEditingComment(null)
      setEditBody("")
    }
  }

  function startReply(comment: CommentDTO) {
    setDeleteConfirmId(null)
    setReplyTo(comment)
    setReplyBody("")
    setError(null)
  }

  function startEdit(comment: CommentDTO) {
    setDeleteConfirmId(null)
    setEditingComment(comment)
    setEditBody(comment.body)
    setReplyTo(null)
    setReplyBody("")
    setError(null)
  }

  function cancelEdit() {
    setEditingComment(null)
    setEditBody("")
  }

  const isAddLoading = loading && !editingComment && !replyTo
  const threads = buildThreads(comments)

  function CommentBody({ comment }: { comment: CommentDTO }) {
    const canManage = isCoach || comment.authorId === currentUserId
    const isEditing = editingComment?.id === comment.id

    return (
      <div
        className="group/comment flex items-start gap-3 text-[15px]"
        onMouseLeave={() => {
          if (deleteConfirmId === comment.id) setDeleteConfirmId(null)
        }}
      >
        <CommentAvatar name={comment.authorName} image={comment.authorImage} />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-foreground dark:text-foreground">
            {comment.authorName}
          </span>
          {comment.authorStaffTitle && <StaffBadge title={comment.authorStaffTitle} />}
          {comment.authorId && attendedUsers.has(comment.authorId) && <AttendedBadge />}
          <span
            className="group relative ml-2 inline-block text-xs text-foreground-tertiary dark:text-foreground-tertiary"
            tabIndex={0}
          >
            {formatRelativeTime(comment.createdAt)}
            <HoverDetail label={formatDateTime(comment.createdAt)} />
          </span>
          {isEditing ? (
            <form onSubmit={handleEdit} className="relative mt-2.5 flex gap-2.5">
              <input
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                disabled={loading}
                autoFocus
                aria-label="Edit comment"
                className="flex-1 rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={
                  loading ||
                  !editBody.trim() ||
                  editBody.trim() === comment.body
                }
                aria-label="Save"
                className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-text transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                <ActionIcon kind="check" className="h-5 w-5" />
                <HoverDetail label="Save" />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={loading}
                aria-label="Cancel"
                className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-fill disabled:opacity-40"
              >
                <ActionIcon kind="close" className="h-5 w-5" />
                <HoverDetail label="Cancel" />
              </button>
              {loading && <CommentLoadingOverlay />}
            </form>
          ) : (
            <p className="whitespace-pre-line break-words leading-relaxed text-foreground">
              {comment.body}
            </p>
          )}
        </div>
        {!isEditing && (
          <div className="pointer-events-none mr-2 flex shrink-0 items-center gap-1 self-center opacity-0 transition-opacity duration-150 group-hover/comment:pointer-events-auto group-hover/comment:opacity-100 group-focus-within/comment:pointer-events-auto group-focus-within/comment:opacity-100 sm:mr-3">
            {deleteConfirmId === comment.id ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleDelete(comment.id)}
                  disabled={loading}
                  aria-label="Confirm delete"
                  className="group relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-red-600 text-primary-text transition-colors hover:bg-red-700 disabled:opacity-40"
                >
                  <ActionIcon kind="check" className="h-5 w-5" />
                  <HoverDetail label="Confirm delete" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={loading}
                  aria-label="Cancel delete"
                  className="group relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-fill disabled:opacity-40"
                >
                  <ActionIcon kind="close" className="h-4 w-4" />
                  <HoverDetail label="Cancel" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => startReply(comment)}
                  className="group relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-fill-secondary hover:text-foreground-secondary"
                  aria-label="Reply to comment"
                >
                  <ActionIcon kind="reply" className="h-5 w-5" />
                  <HoverDetail label="Reply" />
                </button>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(comment)}
                      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-fill-secondary hover:text-foreground-secondary"
                      aria-label="Edit comment"
                    >
                      <ActionIcon kind="edit" className="h-5 w-5" />
                      <HoverDetail label="Edit" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(comment.id)}
                      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-red-50 hover:text-error dark:hover:bg-red-950/40"
                      aria-label="Delete comment"
                    >
                      <ActionIcon kind="delete" className="h-5 w-5" />
                      <HoverDetail label="Delete" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="pb-12 sm:pb-16">
      <h2 className="mb-4.5 text-[15px] font-medium uppercase tracking-wide text-foreground-secondary dark:text-foreground-secondary">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>
      {threads.length > 0 && (
        <ul className="mb-6 space-y-5">
          {threads.map((thread) => (
            <li key={thread.id}>
              <CommentBody comment={thread} />
              {thread.replies.length > 0 && (
                <ul className="mt-3 ml-5 space-y-3.5 border-l border-border-secondary pl-3.5">
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentBody comment={reply} />
                    </li>
                  ))}
                </ul>
              )}
              {replyTo &&
                (replyTo.id === thread.id ||
                  replyTo.parentId === thread.id) && (
                  <form onSubmit={handleReply} className="relative mt-3 ml-5 flex gap-2.5">
                    <input
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      disabled={loading}
                      placeholder={`Reply to ${replyTo.authorName}…`}
                      autoFocus
                      className="flex-1 rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={loading || !replyBody.trim()}
                      aria-label="Reply"
                      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-text transition-colors hover:bg-primary-hover disabled:opacity-40"
                    >
                      <ActionIcon kind="reply" className="h-4 w-4" />
                      <HoverDetail label="Reply" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(null)
                        setReplyBody("")
                      }}
                      aria-label="Cancel"
                      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-fill"
                    >
                      <ActionIcon kind="close" className="h-4 w-4" />
                      <HoverDetail label="Cancel" />
                    </button>
                    {loading && <CommentLoadingOverlay />}
                  </form>
                )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="relative flex gap-2.5">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={isAddLoading}
          placeholder="Add a comment…"
          className="flex-1 rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !body.trim()}
          aria-label="Post"
          className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-text transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <ActionIcon kind="publish" className="h-5 w-5" />
          <HoverDetail label="Post" />
        </button>
        {isAddLoading && <CommentLoadingOverlay />}
      </form>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  )
}
