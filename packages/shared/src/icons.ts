export type IconPrimitive =
  | { tag: "path"; d: string; fill?: "none" | "currentColor" }
  | {
      tag: "circle"
      cx: number
      cy: number
      r: number
      fill?: "none" | "currentColor"
    }
  | {
      tag: "rect"
      x: number
      y: number
      width: number
      height: number
      rx?: number
      ry?: number
    }
  | { tag: "polyline"; points: string }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number }

export const ICONS = {
  home: [
    { tag: "path", d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" },
    {
      tag: "path",
      d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    },
  ],
  roster: [
    { tag: "path", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
    { tag: "circle", cx: 9, cy: 7, r: 4 },
    { tag: "path", d: "M22 21v-2a4 4 0 0 0-3-3.87" },
    { tag: "path", d: "M16 3.13a4 4 0 0 1 0 7.75" },
  ],
  calendar: [
    { tag: "path", d: "M8 2v4" },
    { tag: "path", d: "M16 2v4" },
    { tag: "rect", width: 18, height: 18, x: 3, y: 4, rx: 2 },
    { tag: "path", d: "M3 10h18" },
  ],
  fileText: [
    { tag: "path", d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" },
    { tag: "path", d: "M14 2v6h6" },
    { tag: "path", d: "M8 13h8" },
    { tag: "path", d: "M8 17h8" },
    { tag: "path", d: "M8 9h2" },
  ],
  trophy: [
    { tag: "path", d: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6" },
    { tag: "path", d: "M18 9h1.5a2.5 2.5 0 0 0 0-5H18" },
    { tag: "path", d: "M4 22h16" },
    {
      tag: "path",
      d: "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22",
    },
    {
      tag: "path",
      d: "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22",
    },
    { tag: "path", d: "M18 2H6v7a6 6 0 0 0 12 0V2Z" },
  ],
  user: [
    { tag: "path", d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" },
    { tag: "circle", cx: 12, cy: 7, r: 4 },
  ],
  userRound: [
    { tag: "path", d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" },
    { tag: "circle", cx: 12, cy: 7, r: 4 },
  ],
  graduationCap: [
    { tag: "path", d: "M12 14l9-5-9-5-9 5 9 5z" },
    {
      tag: "path",
      d: "M12 14l6.16-3.422A12.083 12.083 0 0 1 21 13.5c0 2.485-4.03 4.5-9 4.5s-9-2.015-9-4.5c0-.943.38-1.823 1.04-2.615L12 14z",
    },
  ],
  externalLink: [
    { tag: "path", d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" },
    { tag: "polyline", points: "15 3 21 3 21 9" },
    { tag: "line", x1: 10, x2: 21, y1: 14, y2: 3 },
  ],
  settings: [
    {
      tag: "path",
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    },
    { tag: "circle", cx: 12, cy: 12, r: 3 },
  ],
  logOut: [
    { tag: "path", d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" },
    { tag: "polyline", points: "16 17 21 12 16 7" },
    { tag: "line", x1: 21, x2: 9, y1: 12, y2: 12 },
  ],
  bell: [
    { tag: "path", d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" },
    { tag: "path", d: "M10.3 21a1.94 1.94 0 0 0 3.4 0" },
  ],
  gallery: [
    { tag: "rect", x: 3, y: 3, width: 7, height: 7 },
    { tag: "rect", x: 14, y: 3, width: 7, height: 7 },
    { tag: "rect", x: 14, y: 14, width: 7, height: 7 },
    { tag: "rect", x: 3, y: 14, width: 7, height: 7 },
  ],
  list: [
    { tag: "path", d: "M8 6h13" },
    { tag: "path", d: "M8 12h13" },
    { tag: "path", d: "M8 18h13" },
    { tag: "path", d: "M3 6h.01" },
    { tag: "path", d: "M3 12h.01" },
    { tag: "path", d: "M3 18h.01" },
  ],
  calendarWeek: [
    { tag: "rect", width: 18, height: 18, x: 3, y: 4, rx: 2 },
    { tag: "path", d: "M16 2v4" },
    { tag: "path", d: "M8 2v4" },
    { tag: "path", d: "M3 10h18" },
    { tag: "path", d: "M10 14h4" },
    { tag: "path", d: "M10 18h4" },
  ],
  calendarMonth: [
    { tag: "rect", width: 18, height: 18, x: 3, y: 4, rx: 2 },
    { tag: "path", d: "M16 2v4" },
    { tag: "path", d: "M8 2v4" },
    { tag: "path", d: "M3 10h18" },
    { tag: "path", d: "M8 14h.01" },
    { tag: "path", d: "M12 14h.01" },
    { tag: "path", d: "M16 14h.01" },
    { tag: "path", d: "M8 18h.01" },
    { tag: "path", d: "M12 18h.01" },
    { tag: "path", d: "M16 18h.01" },
  ],
  chevronLeft: [
    { tag: "path", d: "m15 18-6-6 6-6" },
  ],
  chevronRight: [
    { tag: "path", d: "m9 18 6-6-6-6" },
  ],
  chevronDown: [
    { tag: "path", d: "m6 9 6 6 6-6" },
  ],
  arrowRight: [
    { tag: "path", d: "M5 12h14" },
    { tag: "path", d: "m12 5 7 7-7 7" },
  ],
  monitor: [
    { tag: "rect", width: 20, height: 14, x: 2, y: 3, rx: 2 },
    { tag: "path", d: "M8 21h8" },
    { tag: "path", d: "M12 17v4" },
  ],
  sun: [
    { tag: "circle", cx: 12, cy: 12, r: 4 },
    { tag: "path", d: "M12 2v2" },
    { tag: "path", d: "M12 20v2" },
    { tag: "path", d: "m4.93 4.93 1.41 1.41" },
    { tag: "path", d: "m17.66 17.66 1.41 1.41" },
    { tag: "path", d: "M2 12h2" },
    { tag: "path", d: "M20 12h2" },
    { tag: "path", d: "m6.34 17.66-1.41 1.41" },
    { tag: "path", d: "m19.07 4.93-1.41 1.41" },
  ],
  moon: [{ tag: "path", d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }],
  idCard: [
    { tag: "rect", width: 18, height: 18, x: 3, y: 3, rx: 2 },
    { tag: "circle", cx: 9, cy: 9, r: 2 },
    { tag: "path", d: "M15 7h2" },
    { tag: "path", d: "M15 11h2" },
    { tag: "path", d: "M7 15h10" },
  ],
  palette: [
    { tag: "circle", cx: 13.5, cy: 6.5, r: 0.5, fill: "currentColor" },
    { tag: "circle", cx: 17.5, cy: 10.5, r: 0.5, fill: "currentColor" },
    { tag: "circle", cx: 8.5, cy: 7.5, r: 0.5, fill: "currentColor" },
    { tag: "circle", cx: 6.5, cy: 12.5, r: 0.5, fill: "currentColor" },
    {
      tag: "path",
      d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z",
    },
  ],
  packet: [
    { tag: "path", d: "M12 7v14" },
    {
      tag: "path",
      d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
    },
  ],
  eventOrder: [
    { tag: "path", d: "M10 12h11" },
    { tag: "path", d: "M10 18h11" },
    { tag: "path", d: "M10 6h11" },
    { tag: "path", d: "M4 10h2" },
    { tag: "path", d: "M4 6h1v4" },
    { tag: "path", d: "M4 18h2" },
    { tag: "path", d: "M4 14h1v4" },
  ],
  entries: [
    { tag: "rect", width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 },
    {
      tag: "path",
      d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    },
    { tag: "path", d: "M12 11h4" },
    { tag: "path", d: "M12 16h4" },
    { tag: "path", d: "M8 11h.01" },
    { tag: "path", d: "M8 16h.01" },
  ],
  psych: [
    { tag: "path", d: "M3 3v18h18" },
    { tag: "path", d: "M7 16l4-8 4 5 4-9" },
  ],
  heat: [
    { tag: "rect", width: 7, height: 7, x: 3, y: 3, rx: 1 },
    { tag: "rect", width: 7, height: 7, x: 14, y: 3, rx: 1 },
    { tag: "rect", width: 7, height: 7, x: 14, y: 14, rx: 1 },
    { tag: "rect", width: 7, height: 7, x: 3, y: 14, rx: 1 },
  ],
  liveStream: [
    {
      tag: "path",
      d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
    },
    { tag: "rect", x: 2, y: 6, width: 14, height: 12, rx: 2 },
  ],
  photos: [
    {
      tag: "path",
      d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
    },
    { tag: "circle", cx: 12, cy: 13, r: 3 },
  ],
  rideSignUps: [
    {
      tag: "path",
      d: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1-2.2-1.3c-.3-.1-.6-.1-.8-.1-2 0-3.8 1.7-3.8 4v4.5",
    },
    { tag: "path", d: "M14 17H9" },
    { tag: "circle", cx: 6.5, cy: 17, r: 2.5 },
    { tag: "circle", cx: 16.5, cy: 17, r: 2.5 },
  ],
  rooms: [
    { tag: "path", d: "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" },
    { tag: "path", d: "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" },
    { tag: "path", d: "M12 4v6" },
    { tag: "path", d: "M2 20h20" },
  ],
  hotel: [
    { tag: "path", d: "M3 21h18" },
    { tag: "path", d: "M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" },
    { tag: "path", d: "M6 11h12" },
    { tag: "path", d: "M10 15h4" },
    { tag: "path", d: "M10 7v4" },
    { tag: "path", d: "M14 7v4" },
  ],
  packingList: [
    { tag: "path", d: "M11 18H3" },
    { tag: "path", d: "M15 18H21" },
    { tag: "path", d: "M16 6h2" },
    { tag: "path", d: "M16 10h2" },
    { tag: "path", d: "M16 14h2" },
    { tag: "path", d: "M3 6h.01" },
    { tag: "path", d: "M7 6h.01" },
    { tag: "path", d: "M11 6h.01" },
    { tag: "path", d: "M7 10h.01" },
    { tag: "path", d: "M7 14h.01" },
    { tag: "path", d: "M3 10h.01" },
    { tag: "path", d: "M3 14h.01" },
  ],
  itinerary: [
    { tag: "path", d: "M8 2v4" },
    { tag: "path", d: "M16 2v4" },
    { tag: "rect", width: 18, height: 18, x: 3, y: 4, rx: 2 },
    { tag: "path", d: "M3 10h18" },
    { tag: "path", d: "M8 14h.01" },
    { tag: "path", d: "M12 14h.01" },
    { tag: "path", d: "M16 14h.01" },
    { tag: "path", d: "M8 18h.01" },
    { tag: "path", d: "M12 18h.01" },
  ],
  clock: [
    { tag: "circle", cx: 12, cy: 12, r: 10 },
    { tag: "polyline", points: "12 6 12 12 16 14" },
  ],
  mapPin: [
    { tag: "path", d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" },
    { tag: "circle", cx: 12, cy: 10, r: 3 },
  ],
  x: [
    { tag: "path", d: "m6 6 12 12" },
    { tag: "path", d: "m18 6-12 12" },
  ],
  check: [
    { tag: "path", d: "M20 6 9 17l-5-5" },
  ],
} as const satisfies Record<string, readonly IconPrimitive[]>

export type IconName = keyof typeof ICONS
