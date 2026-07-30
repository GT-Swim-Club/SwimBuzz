"use client"

import NicknameTagsInput from "./NicknameTagsInput"

type TeamCodesInputProps = {
  value: string[]
  onChange: (codes: string[]) => void
}

export default function TeamCodesInput({ value, onChange }: TeamCodesInputProps) {
  return (
    <NicknameTagsInput
      value={value}
      onChange={onChange}
      placeholder="e.g., GTSC"
      showAddButton={true}
      maxItems={5}
    />
  )
}
