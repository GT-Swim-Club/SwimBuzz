import { useEffect, useRef, useState } from "react"
import { Alert, Platform, Pressable, Switch, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import * as MediaLibrary from "expo-media-library"
import * as Sharing from "expo-sharing"
import { File, Paths } from "expo-file-system"
import { captureRef } from "react-native-view-shot"
import {
  DEFAULT_TIME_ZONE,
  formatDateTime,
  formatFullDate,
  groupPracticeSetsIntoRows,
  isHtmlEmpty,
  isStaffRole,
  practiceShareFilename,
  practiceShareText,
  practiceShareUrl,
  utcToZonedParts,
  zonedDayKey,
  type PracticeShareInput,
  type PracticeShareSet,
  type StaffTitle,
} from "@swimbuzz/shared"
import {
  ActionSheet,
  Body,
  Button,
  ErrorBlock,
  IconButton,
  ListRow,
  LoadingBlock,
  Muted,
  Screen,
  ScrollView,
  Section,
  SubtitleSegments,
  TextField,
  Title,
  usePalette,
  type ActionSheetItem,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api, API_URL, WEB_URL, getAccessToken } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { FormattedText } from "../../../src/components/FormattedText"
import { Icon } from "../../../src/components/Icon"
import { PracticeExportCapture } from "../../../src/components/PracticeExportCapture"
import { RelativeDateText } from "../../../src/components/RelativeDateText"
import { UndoRedoButtons } from "../../../src/components/UndoRedoButtons"
import { ZonedTimeText } from "../../../src/components/ZonedTimeText"
import { StaffBadge } from "../../../src/components/StaffBadge"
import { useAuth } from "../../../src/lib/auth"
import { useUndoableState } from "../../../src/lib/use-undoable-state"

type PracticeSet = {
  id: string
  order: number
  title?: string | null
  content: string
  distance?: number | null
  startsNewRow?: boolean
}

type PracticeComment = {
  id: string
  authorId?: string | null
  authorName?: string
  authorStaffTitle?: StaffTitle | null
  body?: string
  createdAt?: string
  editedAt?: string | null
  parentId?: string | null
}

function toDateInput(value: unknown, timeZone: string): string | null {
  if (!value) return null
  return zonedDayKey(String(value), timeZone)
}

function toTimeInput(value: unknown, timeZone: string): string {
  if (!value) return ""
  const { hour, minute } = utcToZonedParts(new Date(String(value)), timeZone)
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export default function PracticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const tabBarPad = useTabBarScrollPadding()
  const c = usePalette()
  const isStaff = !!user && isStaffRole(user.role)
  const [commentBody, setCommentBody] = useState("")
  const [replyTo, setReplyTo] = useState<PracticeComment | null>(null)
  const [editingComment, setEditingComment] = useState<PracticeComment | null>(null)
  const [posting, setPosting] = useState(false)
  const [published, setPublished] = useState(false)
  const {
    value: editSets,
    set: setEditSets,
    reset: resetEditSets,
    undo: undoEditSets,
    redo: redoEditSets,
    canUndo: canUndoEditSets,
    canRedo: canRedoEditSets,
  } = useUndoableState<PracticeSet[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState<"pdf" | "png" | "photos" | null>(null)
  const [copied, setCopied] = useState<"link" | "text" | null>(null)
  const [savedToastVisible, setSavedToastVisible] = useState(false)
  const exportCaptureRef = useRef<View>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shareSheetDismissRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      if (savedToastTimeoutRef.current) clearTimeout(savedToastTimeoutRef.current)
    }
  }, [])

  const queryClient = useQueryClient()
  const practiceQueryKey = ["practice", id] as const

  const {
    data: practice,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: practiceQueryKey,
    queryFn: () => api.getPractice(id as string),
    enabled: Boolean(id),
  })
  const load = refetch

  /** Apply an optimistic patch to the cached practice, returning a rollback. */
  function patchPracticeOptimistically(
    patch: (old: Record<string, unknown>) => Record<string, unknown>
  ) {
    const previous = queryClient.getQueryData(practiceQueryKey)
    queryClient.setQueryData(practiceQueryKey, (old: Record<string, unknown> | undefined) =>
      old ? patch(old) : old
    )
    return () => queryClient.setQueryData(practiceQueryKey, previous)
  }

  useEffect(() => {
    if (!practice) return
    setPublished(Boolean(practice.published))
    const sets = (
      Array.isArray(practice.sets) ? practice.sets : []
    ) as PracticeSet[]
    resetEditSets(
      sets
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ ...s }))
    )
  }, [practice])

  if (!id) {
    return (
      <Screen>
        <ErrorBlock message="Not found" />
      </Screen>
    )
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    )
  }

  if (!practice) {
    return (
      <Screen>
        <ErrorBlock
          message={error instanceof Error ? error.message : "Failed to load practice"}
        />
      </Screen>
    )
  }

  const sets = (Array.isArray(practice.sets) ? practice.sets : []) as PracticeSet[]
  const comments = (
    Array.isArray(practice.comments) ? practice.comments : []
  ) as PracticeComment[]
  const shareSets: PracticeShareSet[] = sets.map((s) => ({
    title: s.title ?? null,
    content: s.content,
    distance: s.distance ?? null,
    startsNewRow: s.startsNewRow,
  }))
  const totalDistance = sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
  // Named separately from `practice` so the nested functions below (which TS
  // treats as their own closures) keep the non-null narrowing this scope
  // already has, instead of re-flagging `practice` as possibly null.
  const currentPractice = practice

  function shareInput(): PracticeShareInput {
    return {
      title: String(currentPractice.title ?? "Practice"),
      startsAt: String(currentPractice.startsAt ?? new Date().toISOString()),
      endsAt: String(currentPractice.endsAt ?? currentPractice.startsAt ?? new Date().toISOString()),
      timeZone: String(currentPractice.timeZone ?? DEFAULT_TIME_ZONE),
      location: String(currentPractice.location ?? ""),
      course: String(currentPractice.course ?? "SCY"),
      focus: currentPractice.focus ? String(currentPractice.focus) : null,
      tags: Array.isArray(currentPractice.tags) ? (currentPractice.tags as string[]) : [],
      sets: shareSets,
      totalDistance,
    }
  }

  function shareLink(): string {
    const slug =
      typeof currentPractice.slug === "string" && currentPractice.slug ? currentPractice.slug : id
    return practiceShareUrl(WEB_URL, String(slug))
  }

  function flashCopied(which: "link" | "text") {
    setCopied(which)
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopied(null), 2000)
  }

  /**
   * Closes the share sheet and waits for it to actually finish dismissing
   * before resolving. iOS refuses to present a native share/save UI on top
   * of a modal that's still animating closed — the request just hangs with
   * no error — so anything that opens one (Sharing.shareAsync,
   * MediaLibrary writes) must await this first. Falls back to a short
   * timeout in case the dismiss event doesn't fire, so this can never hang
   * the whole flow.
   */
  function closeShareSheetAndWait(): Promise<void> {
    setShareOpen(false)
    if (Platform.OS !== "ios") return Promise.resolve()
    return new Promise((resolve) => {
      const finish = () => {
        shareSheetDismissRef.current = null
        clearTimeout(fallback)
        resolve()
      }
      const fallback = setTimeout(finish, 600)
      shareSheetDismissRef.current = finish
    })
  }

  function handleShareSheetDismiss() {
    shareSheetDismissRef.current?.()
  }

  /** Transient "Saved to Photos" confirmation — dismisses itself, no tap required. */
  function showSavedToast() {
    setSavedToastVisible(true)
    if (savedToastTimeoutRef.current) clearTimeout(savedToastTimeoutRef.current)
    savedToastTimeoutRef.current = setTimeout(() => setSavedToastVisible(false), 2000)
  }

  async function copyShareLink() {
    await Clipboard.setStringAsync(shareLink())
    flashCopied("link")
  }

  async function copyShareText() {
    await Clipboard.setStringAsync(practiceShareText(shareInput()))
    flashCopied("text")
  }

  /** Captures the off-screen PracticeExportCapture mirror to a temp PNG file. */
  async function capturePracticePng(): Promise<string> {
    if (!exportCaptureRef.current) throw new Error("Could not create image")
    return captureRef(exportCaptureRef, { format: "png", quality: 1, result: "tmpfile" })
  }

  async function sharePdf() {
    if (!id) return
    setShareBusy("pdf")
    try {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/api/practices/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error("Could not create PDF")
      const bytes = new Uint8Array(await res.arrayBuffer())
      const filename = practiceShareFilename(
        String(currentPractice.title ?? "practice"),
        currentPractice.startsAt
          ? zonedDayKey(String(currentPractice.startsAt), String(currentPractice.timeZone ?? DEFAULT_TIME_ZONE))
          : null,
        "pdf"
      )
      const file = new File(Paths.cache, filename)
      if (file.exists) file.delete()
      file.write(bytes)
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await closeShareSheetAndWait()
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  async function sharePng() {
    setShareBusy("png")
    try {
      const uri = await capturePracticePng()
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await closeShareSheetAndWait()
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png" })
    } catch (err) {
      Alert.alert("Could not share image", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  async function saveToPhotos() {
    setShareBusy("photos")
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true)
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo access in Settings to save practice images.")
        return
      }
      const uri = await capturePracticePng()
      await MediaLibrary.saveToLibraryAsync(uri)
      await closeShareSheetAndWait()
      showSavedToast()
    } catch (err) {
      Alert.alert("Could not save image", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  function startEdit(comment: PracticeComment) {
    setReplyTo(null)
    setEditingComment(comment)
    setCommentBody(comment.body ?? "")
  }

  function cancelCommentForm() {
    setReplyTo(null)
    setEditingComment(null)
    setCommentBody("")
  }

  async function submitComment() {
    if (!id) return
    const body = commentBody.trim()
    if (!body) {
      Alert.alert("Comment required", "Write a comment before posting.")
      return
    }
    setPosting(true)

    const rollback = editingComment
      ? patchPracticeOptimistically((old) => ({
          ...old,
          comments: (Array.isArray(old.comments) ? old.comments : []).map(
            (c: PracticeComment) =>
              c.id === editingComment.id
                ? { ...c, body, editedAt: new Date().toISOString() }
                : c
          ),
        }))
      : patchPracticeOptimistically((old) => {
          const optimisticComment: PracticeComment = {
            id: `optimistic-${Date.now()}`,
            authorId: user?.id ?? null,
            authorName: user?.name ?? "You",
            authorStaffTitle: user?.staffTitle ?? null,
            body,
            parentId: replyTo?.parentId ?? replyTo?.id ?? null,
            createdAt: new Date().toISOString(),
          }
          return {
            ...old,
            comments: [...(Array.isArray(old.comments) ? old.comments : []), optimisticComment],
          }
        })

    try {
      if (editingComment) {
        await api.editComment(editingComment.id, body)
      } else {
        const parentId = replyTo?.parentId ?? replyTo?.id
        await api.postPracticeComment(id, body, parentId)
      }
      setCommentBody("")
      setReplyTo(null)
      setEditingComment(null)
      await load()
    } catch (err) {
      rollback()
      Alert.alert(
        editingComment ? "Could not update comment" : "Could not post comment",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setPosting(false)
    }
  }

  function confirmDeleteComment(comment: PracticeComment) {
    Alert.alert(
      "Delete comment?",
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteComment(comment),
        },
      ]
    )
  }

  async function deleteComment(comment: PracticeComment) {
    const rollback = patchPracticeOptimistically((old) => ({
      ...old,
      comments: (Array.isArray(old.comments) ? old.comments : []).filter(
        (c: PracticeComment) => c.id !== comment.id
      ),
    }))
    try {
      await api.deleteComment(comment.id)
      if (editingComment?.id === comment.id) cancelCommentForm()
      if (replyTo?.id === comment.id || replyTo?.parentId === comment.id) setReplyTo(null)
      await load()
    } catch (err) {
      rollback()
      Alert.alert(
        "Could not delete comment",
        err instanceof Error ? err.message : "Something went wrong"
      )
    }
  }

  async function saveStaffEdits(nextPublished = published) {
    if (!id || !practice) return
    if (editSets.length === 0 || editSets.some((s) => !s.content.trim())) {
      Alert.alert("Sets required", "Each set needs workout content.")
      return
    }
    setSaving(true)
    try {
      const timeZone = String(practice.timeZone ?? DEFAULT_TIME_ZONE)
      await api.updatePractice(id, {
        title: String(practice.title ?? ""),
        date: toDateInput(practice.startsAt, timeZone),
        startTime: toTimeInput(practice.startsAt, timeZone) || "19:30",
        endTime: toTimeInput(practice.endsAt, timeZone) || "21:00",
        timeZone,
        location: String(practice.location ?? "CRC Comp Pool"),
        // Echoed back so this full-replace PATCH doesn't reset the practice's course to the default.
        course: (practice.course as "SCY" | "LCM" | "SCM" | undefined) ?? "SCY",
        focus:
          practice.focus == null || practice.focus === ""
            ? null
            : String(practice.focus),
        tags: Array.isArray(practice.tags) ? practice.tags : [],
        published: nextPublished,
        // This screen only edits existing sets' text in place (no add/reorder/delete),
        // so pass through the original order/row layout untouched.
        sets: editSets.map((s) => ({
          id: s.id,
          order: s.order,
          startsNewRow: s.startsNewRow ?? true,
          title: s.title?.trim() || null,
          content: s.content.trim(),
          distance: s.distance ?? null,
        })),
      })
      setPublished(nextPublished)
      await load()
      Alert.alert("Saved", "Practice updated.")
    } catch (err) {
      Alert.alert(
        "Could not save practice",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    if (!id) return
    Alert.alert(
      "Move practice to Trash?",
      "You can restore it from Trash later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move to Trash",
          style: "destructive",
          onPress: () => void deletePractice(),
        },
      ]
    )
  }

  async function deletePractice() {
    if (!id) return
    setDeleting(true)
    try {
      await api.deletePractice(id)
      router.replace("/practices")
    } catch (err) {
      Alert.alert(
        "Could not delete practice",
        err instanceof Error ? err.message : "Something went wrong"
      )
      setDeleting(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }}>
          <Title style={{ flex: 1 }}>{String(practice.title ?? "Practice")}</Title>
          <Pressable
            onPress={() => setShareOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Share practice"
            hitSlop={8}
            style={{ paddingVertical: spacing.xxs, paddingHorizontal: spacing.xs }}
          >
            <Icon name="share" size={22} color={c.text} />
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: spacing.sm,
          }}
        >
          <SubtitleSegments
            textStyle={{ fontSize: 14, color: c.textSecondary }}
            segments={[
              practice.startsAt ? (
                <RelativeDateText
                  value={String(practice.startsAt)}
                  kind="event"
                  timeZone={String(practice.timeZone ?? DEFAULT_TIME_ZONE)}
                  absolute={formatFullDate(String(practice.startsAt), String(practice.timeZone ?? DEFAULT_TIME_ZONE))}
                  style={{ fontSize: 14, color: c.textSecondary }}
                />
              ) : null,
              practice.startsAt ? (
                <ZonedTimeText
                  startsAt={String(practice.startsAt)}
                  endsAt={practice.endsAt ? String(practice.endsAt) : null}
                  timeZone={String(practice.timeZone ?? DEFAULT_TIME_ZONE)}
                  style={{ fontSize: 14, color: c.textSecondary }}
                />
              ) : null,
              practice.location ? String(practice.location) : null,
            ]}
          />
        </View>
        {practice.focus && !isHtmlEmpty(String(practice.focus)) ? (
          <View style={{ marginBottom: spacing.md }}>
            <FormattedText html={String(practice.focus)} />
          </View>
        ) : null}

        {error ? (
          <ErrorBlock message={error instanceof Error ? error.message : "Failed to load practice"} />
        ) : null}

        {isStaff ? (
          <Section title="Staff">
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: spacing.md,
              }}
            >
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Body style={{ fontWeight: "600" }}>Published</Body>
                <Muted>Visible to athletes when on</Muted>
              </View>
              <Switch
                value={published}
                disabled={saving}
                onValueChange={(value) => void saveStaffEdits(value)}
                trackColor={{
                  false: c.switchTrack,
                  true: c.primary,
                }}
                thumbColor={c.switchThumb}
              />
            </View>
            <Button
              label="Move to Trash"
              variant="danger"
              loading={deleting}
              onPress={confirmDelete}
            />
          </Section>
        ) : null}

        <Section title="Sets">
          {isStaff ? (
            editSets.length === 0 ? (
              <Muted>No sets yet.</Muted>
            ) : (
              <>
                {editSets.map((set, index) => (
                  <View key={set.id} style={{ marginBottom: spacing.md }}>
                    <TextField
                      label={`Set ${index + 1} title`}
                      value={set.title ?? ""}
                      onChangeText={(text) =>
                        setEditSets(
                          (prev) => prev.map((s, i) => (i === index ? { ...s, title: text } : s)),
                          `set:${index}:title`
                        )
                      }
                    />
                    <TextField
                      label="Content"
                      value={set.content}
                      onChangeText={(text) =>
                        setEditSets(
                          (prev) => prev.map((s, i) => (i === index ? { ...s, content: text } : s)),
                          `set:${index}:content`
                        )
                      }
                      multiline
                      style={{ minHeight: 72, textAlignVertical: "top" }}
                    />
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    marginBottom: spacing.sm,
                  }}
                >
                  <UndoRedoButtons
                    canUndo={canUndoEditSets}
                    canRedo={canRedoEditSets}
                    onUndo={undoEditSets}
                    onRedo={redoEditSets}
                  />
                </View>
                <Button
                  label="Save sets"
                  loading={saving}
                  onPress={() => void saveStaffEdits()}
                />
              </>
            )
          ) : sets.length === 0 ? (
            <Muted>No sets published.</Muted>
          ) : (
            groupPracticeSetsIntoRows(
              sets.slice().sort((a, b) => a.order - b.order)
            ).map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={
                  row.length > 1
                    ? { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }
                    : undefined
                }
              >
                {row.map((set) => (
                  <View
                    key={set.id}
                    style={row.length > 1 ? { flex: 1, minWidth: 0 } : { marginBottom: spacing.md }}
                  >
                    <Body style={{ fontWeight: "700" }}>
                      {set.title || `Set ${set.order + 1}`}
                      {set.distance ? ` · ${set.distance}` : ""}
                    </Body>
                    <FormattedText html={set.content} />
                  </View>
                ))}
              </View>
            ))
          )}
        </Section>

        <Section title="Comments">
          {comments.length === 0 ? (
            <Muted style={{ marginBottom: spacing.sm }}>No comments yet.</Muted>
          ) : (
            comments.map((comment) => {
              const isOwn = !!user && comment.authorId === user.id
              const canEdit = isOwn
              const canDelete = isStaff || isOwn
              return (
                <ListRow
                  key={comment.id}
                  right={
                    <View style={{ flexDirection: "row" }}>
                      <IconButton
                        label="Reply"
                        onPress={() => {
                          setEditingComment(null)
                          setReplyTo(comment)
                          setCommentBody("")
                        }}
                      />
                      {canEdit ? (
                        <IconButton label="Edit" onPress={() => startEdit(comment)} />
                      ) : null}
                      {canDelete ? (
                        <IconButton
                          label="Delete"
                          onPress={() => confirmDeleteComment(comment)}
                        />
                      ) : null}
                    </View>
                  }
                  title={String(comment.authorName ?? "Someone")}
                  titleAdornment={
                    comment.authorStaffTitle ? (
                      <StaffBadge title={comment.authorStaffTitle} />
                    ) : undefined
                  }
                  subtitleSegments={[
                    comment.parentId ? "Reply" : null,
                    comment.body,
                    comment.createdAt ? (
                      <RelativeDateText
                        value={String(comment.createdAt)}
                        kind="instant"
                        absolute={formatDateTime(String(comment.createdAt))}
                        style={{ fontSize: 13, color: c.textSecondary }}
                      />
                    ) : null,
                    comment.editedAt ? "Edited" : null,
                  ]}
                />
              )
            })
          )}

          {replyTo || editingComment ? (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing.xs,
              }}
            >
              <Muted>
                {editingComment
                  ? "Editing your comment"
                  : `Replying to ${replyTo?.authorName ?? "someone"}`}
              </Muted>
              <IconButton label="Cancel" onPress={cancelCommentForm} />
            </View>
          ) : null}
          <TextField
            label={editingComment ? "Edit comment" : replyTo ? "Write a reply" : "Add a comment"}
            value={commentBody}
            onChangeText={setCommentBody}
            placeholder={replyTo ? "Write a reply…" : "Write something…"}
            multiline
            style={{ minHeight: 88, textAlignVertical: "top" }}
          />
          <Button
            label={editingComment ? "Save changes" : replyTo ? "Post reply" : "Post comment"}
            loading={posting}
            onPress={() => void submitComment()}
          />
        </Section>
      </ScrollView>

      <ActionSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onDismiss={handleShareSheetDismiss}
        title="Share practice"
        groups={[
          [
            {
              key: "link",
              label: copied === "link" ? "Copied" : "Copy link",
              icon: <Icon name={copied === "link" ? "check" : "link"} size={20} color={c.text} />,
              onPress: () => void copyShareLink(),
            },
            {
              key: "text",
              label: copied === "text" ? "Copied" : "Copy as text",
              icon: <Icon name={copied === "text" ? "check" : "copy"} size={20} color={c.text} />,
              onPress: () => void copyShareText(),
            },
          ],
          [
            {
              key: "pdf",
              label: "Share PDF",
              icon: <Icon name="fileText" size={20} color={c.text} />,
              busy: shareBusy === "pdf",
              disabled: Boolean(shareBusy) && shareBusy !== "pdf",
              onPress: () => void sharePdf(),
            },
            {
              key: "png",
              label: "Share PNG",
              icon: <Icon name="image" size={20} color={c.text} />,
              busy: shareBusy === "png",
              disabled: Boolean(shareBusy) && shareBusy !== "png",
              onPress: () => void sharePng(),
            },
            {
              key: "photos",
              label: "Save to Photos",
              icon: <Icon name="image" size={20} color={c.text} />,
              busy: shareBusy === "photos",
              disabled: Boolean(shareBusy) && shareBusy !== "photos",
              onPress: () => void saveToPhotos(),
            },
          ] satisfies ActionSheetItem[],
        ]}
      />

      {/* Off-screen mirror captured to PNG for Share PNG / Save to Photos — never shown in the layout. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: -10000 }}>
        <PracticeExportCapture
          ref={exportCaptureRef}
          title={String(practice.title ?? "Practice")}
          showDraft={isStaff && !published}
          startsAt={String(practice.startsAt ?? new Date().toISOString())}
          endsAt={String(practice.endsAt ?? practice.startsAt ?? new Date().toISOString())}
          timeZone={String(practice.timeZone ?? DEFAULT_TIME_ZONE)}
          location={String(practice.location ?? "")}
          course={String(practice.course ?? "SCY")}
          focus={practice.focus ? String(practice.focus) : null}
          tags={Array.isArray(practice.tags) ? (practice.tags as string[]) : []}
          sets={shareSets}
          totalDistance={totalDistance}
        />
      </View>

      {savedToastVisible ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: tabBarPad, alignItems: "center" }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              borderRadius: 999,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              backgroundColor: c.bgElevated,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }}
          >
            <Icon name="check" size={16} color={c.primaryActive} />
            <Body style={{ fontWeight: "600" }}>Saved to Photos</Body>
          </View>
        </View>
      ) : null}
    </Screen>
  )
}
