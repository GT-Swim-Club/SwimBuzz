import { View } from "react-native"
import { Body, Muted, Section } from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"

export type EventOrderRow = {
  women: number | null
  event: string
  men: number | null
}

export type EventOrderSession = {
  label: string
  rows: EventOrderRow[]
}

export type EventOrder = {
  sessions: EventOrderSession[]
}

export function isEventOrder(value: unknown): value is EventOrder {
  if (!value || typeof value !== "object") return false
  const sessions = (value as EventOrder).sessions
  if (!Array.isArray(sessions)) return false
  return sessions.every(
    (s) =>
      typeof s.label === "string" &&
      Array.isArray(s.rows) &&
      s.rows.every(
        (r) =>
          typeof r.event === "string" &&
          (r.women === null || typeof r.women === "number") &&
          (r.men === null || typeof r.men === "number")
      )
  )
}

function cleanEventName(name: string): string {
  return name.replace(/[*^†‡]+(?:\s*)$/u, "").trim()
}

function showSessionLabel(label: string): boolean {
  return label.trim().toLowerCase() !== "order of events"
}

export function EventOrderSection({ order }: { order: EventOrder }) {
  if (!order.sessions.length) return null

  return (
    <Section title="Order of events">
      {order.sessions.map((session, sessionIndex) => (
        <View
          key={`${session.label}-${sessionIndex}`}
          style={{ marginBottom: spacing.md }}
        >
          {showSessionLabel(session.label) ? (
            <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
              {session.label}
            </Body>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              paddingVertical: spacing.xxs,
              borderBottomWidth: 1,
              borderBottomColor: colors.light.border,
              marginBottom: spacing.xxs,
            }}
          >
            <Muted style={{ width: 48, fontWeight: "700" }}>W</Muted>
            <Muted style={{ flex: 1, textAlign: "center", fontWeight: "700" }}>
              Event
            </Muted>
            <Muted style={{ width: 48, textAlign: "right", fontWeight: "700" }}>
              M
            </Muted>
          </View>
          {session.rows.map((row, i) => (
            <View
              key={`${session.label}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 4,
              }}
            >
              <Muted style={{ width: 48 }}>
                {row.women != null ? String(row.women) : ""}
              </Muted>
              <Body style={{ flex: 1, textAlign: "center", fontSize: 14 }}>
                {cleanEventName(row.event)}
              </Body>
              <Muted style={{ width: 48, textAlign: "right" }}>
                {row.men != null ? String(row.men) : ""}
              </Muted>
            </View>
          ))}
        </View>
      ))}
    </Section>
  )
}
