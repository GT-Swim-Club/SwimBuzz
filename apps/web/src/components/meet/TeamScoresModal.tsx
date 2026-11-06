"use client"

import Modal, { ModalFooter } from "@/components/ui/Modal"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import {
  formatPoints,
  TEAM_SCORE_SECTIONS,
  teamPlaceLabel,
  type TeamScores,
  type TeamScoresSection,
} from "@swimbuzz/shared"

/** Every team's standing — women, men and combined — with our team's line in gold. */
export default function TeamScoresModal({
  teamScores,
  section,
  onSectionChange,
  open,
  onClose,
}: {
  teamScores: TeamScores
  section: TeamScoresSection
  onSectionChange: (section: TeamScoresSection) => void
  open: boolean
  onClose: () => void
}) {
  const sections = TEAM_SCORE_SECTIONS.filter((s) => teamScores[s.key].length > 0)
  const standings = teamScores[section]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Team Scores"
      description={
        teamScores.source === "computed"
          ? "Added up from the points in the results."
          : undefined
      }
      maxWidth="md"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill"
          >
            Done
          </button>
        </ModalFooter>
      }
    >
      {sections.length > 1 ? (
        <SegmentedToggle
          selectedIndex={Math.max(0, sections.findIndex((s) => s.key === section))}
          fullWidth
          className="mb-3 rounded-lg border border-border-secondary bg-background"
        >
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSectionChange(s.key)}
              className={segmentedOptionClass(section === s.key) + " text-xs"}
            >
              {s.label}
            </button>
          ))}
        </SegmentedToggle>
      ) : null}
      <ol className="divide-y divide-border-secondary">
        {standings.map((standing) => (
          <li
            key={`${standing.place}-${standing.team}`}
            className={`flex items-center gap-3 py-2 text-sm tabular-nums ${
              standing.ours ? "font-semibold text-accent" : "text-foreground"
            }`}
          >
            <span
              className={`w-10 shrink-0 text-right text-xs ${
                standing.ours ? "text-accent" : "text-foreground-tertiary"
              }`}
            >
              {teamPlaceLabel(standing, standings)}
            </span>
            <span className="min-w-0 flex-1 truncate">{standing.team}</span>
            <span className="shrink-0 font-mono">{formatPoints(standing.points)}</span>
          </li>
        ))}
      </ol>
    </Modal>
  )
}
