"use client"

import { useState } from "react"
import type { MeetSignupQuestion, MeetSignupQuestionType } from "@/lib/meet-signup"

export function MeetFormCustomQuestionsEditor({
  questions,
  onChange,
}: {
  questions: MeetSignupQuestion[]
  onChange: (questions: MeetSignupQuestion[]) => void
}) {
  const [questionDraft, setQuestionDraft] = useState("")
  const [questionType, setQuestionType] = useState<MeetSignupQuestionType>("text")
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})

  function addQuestion() {
    const label = questionDraft.trim()
    if (!label) return
    const id = `q_${Date.now().toString(36)}`
    onChange([
      ...questions,
      {
        id,
        label,
        required: false,
        type: questionType,
        options: questionType === "choice" ? ["Yes", "No"] : [],
      },
    ])
    setQuestionDraft("")
    setQuestionType("text")
  }

  function addOption(questionId: string) {
    const draft = (optionDrafts[questionId] ?? "").trim()
    if (!draft) return
    onChange(
      questions.map((item) => {
        if (item.id !== questionId) return item
        if (item.options.includes(draft)) return item
        return { ...item, options: [...item.options, draft] }
      })
    )
    setOptionDrafts((d) => ({ ...d, [questionId]: "" }))
  }

  return (
    <div>
      <label className="block text-xs font-medium text-foreground-secondary mb-1">
        Custom questions
      </label>
      {questions.length > 0 && (
        <div className="space-y-3 mb-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className="bg-background rounded-lg border border-border px-3 py-2 space-y-2"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{q.label}</p>
                  <p className="text-xs text-gray-400">
                    {q.type === "choice" ? "Multiple choice" : "Short text"}
                  </p>
                </div>
                <label className="flex items-center gap-1 text-xs text-foreground-secondary shrink-0">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      onChange(
                        questions.map((item) =>
                          item.id === q.id ? { ...item, required: e.target.checked } : item
                        )
                      )
                    }
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Remove custom question “${q.label}”?`)) return
                    onChange(questions.filter((item) => item.id !== q.id))
                  }}
                  className="text-xs text-error shrink-0"
                >
                  Remove
                </button>
              </div>

              {q.type === "choice" && (
                <div className="space-y-1.5 pl-0.5">
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((opt) => (
                      <span
                        key={opt}
                        className="bg-background inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border"
                      >
                        {opt}
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`Remove “${opt}” from choices?`)) return
                            onChange(
                              questions.map((item) =>
                                item.id === q.id
                                  ? { ...item, options: item.options.filter((o) => o !== opt) }
                                  : item
                              )
                            )
                          }}
                          className="text-foreground-tertiary hover:text-red-500"
                          aria-label={`Remove ${opt}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={optionDrafts[q.id] ?? ""}
                      onChange={(e) =>
                        setOptionDrafts((d) => ({ ...d, [q.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addOption(q.id)
                        }
                      }}
                      placeholder="Add choice"
                      className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs bg-background"
                    />
                    <button
                      type="button"
                      onClick={() => addOption(q.id)}
                      disabled={!(optionDrafts[q.id] ?? "").trim()}
                      className="text-xs px-2 py-1.5 border border-border rounded-lg hover:bg-fill-secondary disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                  {q.options.length < 2 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Add at least 2 choices
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={questionDraft}
          onChange={(e) => setQuestionDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addQuestion()
            }
          }}
          placeholder="Add question + Enter"
          className="flex-1 min-w-[10rem] rounded-lg border border-border px-3 py-2 text-sm bg-background"
        />
        <select
          value={questionType}
          onChange={(e) => setQuestionType(e.target.value as MeetSignupQuestionType)}
          className="rounded-lg border border-border px-2 py-2 text-sm bg-background"
        >
          <option value="text">Short text</option>
          <option value="choice">Multiple choice</option>
        </select>
        <button
          type="button"
          onClick={addQuestion}
          disabled={!questionDraft.trim()}
          className="text-sm px-3 py-2 border border-border rounded-lg hover:bg-fill-secondary disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}

export function MeetFormCustomQuestionFields({
  questions,
  answers,
  onChange,
  disabled = false,
}: {
  questions: MeetSignupQuestion[]
  answers: Record<string, string>
  onChange: (answers: Record<string, string>) => void
  disabled?: boolean
}) {
  if (questions.length === 0) return null

  return (
    <>
      {questions.map((q) => (
        <div key={q.id}>
          <label className="block text-xs font-medium text-foreground-secondary mb-1">
            {q.label}
            {q.required ? <span className="text-red-500"> *</span> : null}
          </label>
          {q.type === "choice" ? (
            <select
              value={answers[q.id] ?? ""}
              onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
              required={q.required}
              disabled={disabled}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            >
              <option value="">{q.required ? "Select…" : "—"}</option>
              {q.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={answers[q.id] ?? ""}
              onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
              required={q.required}
              disabled={disabled}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            />
          )}
        </div>
      ))}
    </>
  )
}
