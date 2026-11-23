// Events offered when logging or editing a swim or relay by hand.

const strokeEvents = (distances: number[], stroke: string) => distances.map((d) => `${d} ${stroke}`)

/** Individual events by stroke, shortest first — 25s included (swum at intrasquads). */
export const INDIVIDUAL_SWIM_EVENTS: readonly string[] = [
  ...strokeEvents([25, 50, 100, 200, 400, 500, 1000, 1650], "Free"),
  ...strokeEvents([25, 50, 100, 200], "Back"),
  ...strokeEvents([25, 50, 100, 200], "Breast"),
  ...strokeEvents([25, 50, 100, 200], "Fly"),
  ...strokeEvents([100, 200, 400], "IM"),
]

/** Relay events; the 4x25 relays (swum at intrasquads) last. */
export const RELAY_SWIM_EVENTS: readonly string[] = [
  "200 Medley Relay",
  "200 Free Relay",
  "400 Free Relay",
  "800 Free Relay",
  "400 Medley Relay",
  "100 Free Relay",
  "100 Medley Relay",
]
