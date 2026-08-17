import { useCallback, useEffect, useState } from "react"
import { Alert, Switch, View } from "react-native"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { formatClockTimeRange, formatDateTime, isHtmlEmpty, isStaffRole } from "@swimbuzz/shared"
import {
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
  TextField,
  Title,
  usePalette,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { FormattedText } from "../../../src/components/FormattedText"
import { useAuth } from "../../../src/lib/auth"

type PracticeSet = {
  id: string
  order: number
  title?: string | null
  content: string
  distance?: number | null
}

type PracticeComment = {
  id: string
  authorName?: string
  body?: string
  createdAt?: string
  parentId?: string | null
}

function toDateInput(value: unknown): string | null {
  if (!value) return null
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export default function PracticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const tabBarPad = useTabBarScrollPadding()
  const c = usePalette()
  const isStaff = !!user && isStaffRole(user.role)
  const [practice, setPractice] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [replyTo, setReplyTo] = useState<PracticeComment | null>(null)
  const [posting, setPosting] = useState(false)
  const [published, setPublished] = useState(false)
  const [editSets, setEditSets] = useState<PracticeSet[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      const data = await api.getPractice(id)
      setPractice(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load practice")
      setPractice(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  useEffect(() => {
    if (!practice) return
    setPublished(Boolean(practice.published))
    const sets = (
      Array.isArray(practice.sets) ? practice.sets : []
    ) as PracticeSet[]
    setEditSets(
      sets
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ ...s }))
    )
  }, [practice])

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    )
  }

  if (!practice) {
    return (
      <Screen>
        <ErrorBlock message={error ?? "Not found"} />
      </Screen>
    )
  }

  const sets = (Array.isArray(practice.sets) ? practice.sets : []) as PracticeSet[]
  const comments = (
    Array.isArray(practice.comments) ? practice.comments : []
  ) as PracticeComment[]

  async function postComment() {
    if (!id) return
    const body = commentBody.trim()
    if (!body) {
      Alert.alert("Comment required", "Write a comment before posting.")
      return
    }
    setPosting(true)
    try {
      const parentId = replyTo?.parentId ?? replyTo?.id
      await api.postPracticeComment(id, body, parentId)
      setCommentBody("")
      setReplyTo(null)
      await load()
    } catch (err) {
      Alert.alert(
        "Could not post comment",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setPosting(false)
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
      await api.updatePractice(id, {
        title: String(practice.title ?? ""),
        date: toDateInput(practice.date),
        startTime: String(practice.startTime ?? "19:30"),
        endTime: String(practice.endTime ?? "21:00"),
        location: String(practice.location ?? "CRC Comp Pool"),
        focus:
          practice.focus == null || practice.focus === ""
            ? null
            : String(practice.focus),
        tags: Array.isArray(practice.tags) ? practice.tags : [],
        published: nextPublished,
        sets: editSets.map((s, index) => ({
          id: s.id,
          order: index,
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
      "Delete practice?",
      "This permanently deletes the practice and its sets.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
        <Title>{String(practice.title ?? "Practice")}</Title>
        <Muted style={{ marginBottom: spacing.sm }}>
          {[
            practice.date
              ? new Date(String(practice.date)).toLocaleDateString()
              : null,
            formatClockTimeRange(String(practice.startTime ?? ""), String(practice.endTime ?? "")),
            practice.location,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Muted>
        {practice.focus && !isHtmlEmpty(String(practice.focus)) ? (
          <View style={{ marginBottom: spacing.md }}>
            <FormattedText html={String(practice.focus)} />
          </View>
        ) : null}

        {error ? <ErrorBlock message={error} /> : null}

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
              label="Delete practice"
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
                        setEditSets((prev) =>
                          prev.map((s, i) =>
                            i === index ? { ...s, title: text } : s
                          )
                        )
                      }
                    />
                    <TextField
                      label="Content"
                      value={set.content}
                      onChangeText={(text) =>
                        setEditSets((prev) =>
                          prev.map((s, i) =>
                            i === index ? { ...s, content: text } : s
                          )
                        )
                      }
                      multiline
                      style={{ minHeight: 72, textAlignVertical: "top" }}
                    />
                  </View>
                ))}
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
            sets
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((set) => (
                <View key={set.id} style={{ marginBottom: spacing.md }}>
                  <Body style={{ fontWeight: "700" }}>
                    {set.title || `Set ${set.order + 1}`}
                    {set.distance ? ` · ${set.distance}y` : ""}
                  </Body>
                  <FormattedText html={set.content} />
                </View>
              ))
          )}
        </Section>

        <Section title="Comments">
          {comments.length === 0 ? (
            <Muted style={{ marginBottom: spacing.sm }}>No comments yet.</Muted>
          ) : (
            comments.map((comment) => (
              <ListRow
                key={comment.id}
                right={
                  <IconButton
                    label="Reply"
                    onPress={() => {
                      setReplyTo(comment)
                      setCommentBody("")
                    }}
                  />
                }
                title={String(comment.authorName ?? "Someone")}
                subtitle={[
                  comment.parentId ? "Reply" : null,
                  comment.body,
                  comment.createdAt
                    ? formatDateTime(String(comment.createdAt))
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))
          )}

          {replyTo ? (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing.xs,
              }}
            >
              <Muted>{`Replying to ${replyTo.authorName ?? "someone"}`}</Muted>
              <IconButton label="Cancel" onPress={() => setReplyTo(null)} />
            </View>
          ) : null}
          <TextField
            label={replyTo ? "Write a reply" : "Add a comment"}
            value={commentBody}
            onChangeText={setCommentBody}
            placeholder={replyTo ? "Write a reply…" : "Write something…"}
            multiline
            style={{ minHeight: 88, textAlignVertical: "top" }}
          />
          <Button
            label={replyTo ? "Post reply" : "Post comment"}
            loading={posting}
            onPress={() => void postComment()}
          />
        </Section>
      </ScrollView>
    </Screen>
  )
}
