import { useState } from "react"
import { View } from "react-native"
import { Chip, TextField, usePalette } from "@swimbuzz/ui"
import {
  addSwimCloudIds,
  MAX_SWIMCLOUD_IDS,
  normalizeSwimCloudIdInput,
  parseSwimCloudProfileList,
  SWIMCLOUD_ID_ERROR,
  SWIMCLOUD_IDS_LIMIT_ERROR,
} from "@swimbuzz/shared"
import { spacing } from "@swimbuzz/tokens"
import { Icon } from "./Icon"

/**
 * State for SwimCloudIdsField. `allIds` also counts a valid ID still sitting in
 * the text box, so saving without pressing return first keeps it.
 */
export function useSwimCloudIdsField(initial: number[] = []) {
  const [ids, setIds] = useState(initial)
  const [draft, setDraft] = useState("")
  const parsedDraft = parseSwimCloudProfileList(draft)
  const allIds = [...new Set([...ids, ...parsedDraft.ids])]
  const draftInvalid = parsedDraft.invalid.length > 0
  const overLimit = allIds.length > MAX_SWIMCLOUD_IDS
  return {
    ids,
    setIds,
    draft,
    setDraft,
    allIds,
    draftInvalid,
    overLimit,
    valid: !draftInvalid && !overLimit,
  }
}

type SwimCloudIdsFieldState = ReturnType<typeof useSwimCloudIdsField>

const SEPARATOR = /[\s,;]/

/**
 * One text box for up to MAX_SWIMCLOUD_IDS SwimCloud IDs or profile links. Return,
 * comma, or space turns the text into a chip (tap to remove); pasting several at
 * once adds them all.
 */
export function SwimCloudIdsField({
  field,
  label,
}: {
  field: SwimCloudIdsFieldState
  label: string
}) {
  const c = usePalette()
  const { ids, setIds, draft, setDraft, draftInvalid, overLimit } = field
  const full = ids.length >= MAX_SWIMCLOUD_IDS && draft === ""

  function commit(text: string, typing = "") {
    const next = addSwimCloudIds(ids, text)
    setIds(next.ids)
    setDraft([next.leftover, typing].filter(Boolean).join(" "))
  }

  function onChangeText(value: string) {
    if (!SEPARATOR.test(value)) {
      setDraft(normalizeSwimCloudIdInput(value))
      return
    }
    // Commit finished pieces; keep the last one in the box while it's still being typed.
    const pieces = value.split(SEPARATOR)
    const typing = SEPARATOR.test(value.slice(-1)) ? "" : (pieces.pop() ?? "")
    commit(pieces.join(" "), normalizeSwimCloudIdInput(typing))
  }

  return (
    <View style={{ marginBottom: spacing.sm }}>
      <TextField
        label={label}
        accessibilityLabel="SwimCloud ID or URL"
        placeholder={
          full
            ? `${MAX_SWIMCLOUD_IDS} of ${MAX_SWIMCLOUD_IDS} added`
            : ids.length === 0
              ? "Paste a SwimCloud profile link or ID"
              : "Add another"
        }
        editable={!full}
        value={draft}
        onChangeText={onChangeText}
        onSubmitEditing={() => commit(draft)}
        onBlur={() => {
          if (draft.trim()) commit(draft)
        }}
        returnKeyType="done"
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        autoCorrect={false}
        error={
          draftInvalid ? SWIMCLOUD_ID_ERROR : overLimit ? SWIMCLOUD_IDS_LIMIT_ERROR : undefined
        }
      />
      {ids.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.xxs }}>
          {ids.map((id) => (
            <Chip
              key={id}
              label={String(id)}
              icon={<Icon name="x" size={14} color={c.textSecondary} />}
              accessibilityLabel={`Remove SwimCloud ID ${id}`}
              onPress={() => setIds(ids.filter((entry) => entry !== id))}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}
