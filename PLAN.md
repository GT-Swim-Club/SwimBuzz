# Meet modals redesign — edit meet, competition resources, travel, photos

Source: claude.ai/design project d80d1934 → `Meet Page.dc.html` (modals at lines ~863–1272, logic in
`photoVals`/`editVals`/`trvVals`/`resVals`). Web only. Decisions from user:
- SwimPhone + Results PDF rows move into the Competition Resources modal; the separate Import results
  icon button on the Competition card is removed (ImportMeetButton stays for the athletes page).
- Results import runs only when the SwimPhone URL / Results PDF was added or changed in this edit; Save
  label becomes "Save and import results" only then.
- Create meet + Edit meet (meet page and meets list) share the new form layout.
- Hotel / packing / itinerary keep RichTextField inside the expanded row; summary = first line as plain text.
- Time zone keeps the full US_TIME_ZONES list (existing TimeZonePicker).

## Shared pieces
- `Modal`: new `top` prop rendered above the header/body with no padding (edit-meet banner).
- `components/meet/ResourceRows.tsx`: bordered status list (`ResourceList`, `ResourceRow`) — icon, label,
  and right side "+ Add" | summary + × | "N files ›" | Done/Cancel; expanded row gets bg-background-layout.
  `ResourceModalHeader` (title + "N of M added"). `ResourceDropzone` (dashed, "Click or drag and drop…"),
  `LinkInput` (commit on Enter/blur).
- `components/meet/useResultsImport.tsx`: pdf/swimphone import + scraper gate + pairing modal, lifted from
  ImportMeetButton (which now uses it).

## Modals
1. Edit/Create meet (`MeetFormModal` + `MeetFields`): 136px banner header (click/drop to upload → cropper,
   hover "Click or drop to replace" + Remove), round × close, 68px icon tile overlapping bottom-left (+ Icon /
   remove ×), sr-only title. Body: name (16px semibold), Location | School, "When" button → inline
   range calendar (click start, click end; Single day clears end) + First session TimePicker + TimeZonePicker +
   Done, Course segmented SCY/SCM/LCM | Season select (+ New Season kept). Footer Cancel / Save changes.
2. Travel: rows Ride sign-ups, Rooms (file or link, Cancel), Hotel, Packing list, Itinerary (rich text, Done).
3. Competition resources: header title + count, team code inline (pencil to edit, ✓ to save; input shown when
   empty). Rows: Meet packet, Entries, Psych sheet (single file/link), Heat sheets, Finals heat sheets (multi:
   items with optional label, dropzone + link to add), Live stream, SwimPhone results (link only), Results PDF.
   Sheet pairing modal kept; results pairing modal opens after it.
4. Photos: rows Photo albums (name/url pairs, max 15, "+ Add another album") and Gallery photos (grid,
   drag to reorder, dropzone, "N / 20 · Drag to reorder.", max 20).


---

# Meet page redesign — roster summary has entries

Source: claude.ai/design project d80d1934 → `Meet Page.dc.html` (copy in session scratchpad).
Scope decided with user: full design incl. swim detail modal; sign-up/rooms/relays become ledger link rows
to existing subpages; no global nav changes; web only (no mobile).
An empty-roster-summary design will follow — until then that case keeps the current layout.

## Layout (apps/web/src/app/meets/[id]/page.tsx)
- `hasRosterSummaryContent` (any sheet summary entries, results, or relay results) → new two-column layout;
  otherwise render the existing single-column page unchanged.
- Header unchanged (back link, title, edit/delete, date, location · school), `max-w-[1240px]`.
- Row: `MeetLedger` (left aside, resizable 280–640px, default 420, width in localStorage
  `swimbuzz-meet-ledger-width-v2`, pins inside `#page-scroll` via translate — design's measure/apply logic;
  stacks full-width ≤900px) + resize handle + right column with `MeetSheetSummarySection`.

## Ledger cards (components/meet/LedgerCard.tsx: LedgerCard, LedgerRow)
1. Highlights — `MeetHighlightsCarousel`: pages of counters (3/page; hinted counters 2/page), dots, prev/next,
   6s autoplay paused on hover, count-up. Biggest drop value in success green.
2. Starts in — `MeetCountdown variant="ledger"` with 4-cell grid + start date label (upcoming && hasStartTime).
3. Sign-ups — `MeetSignupSection variant="ledger"`: status pill; Manage sign-ups / Open|Review sign-up rows;
   coach responses modal preserved.
4. Competition — edit resources + import results icon buttons; rows: packet, order of events, entries,
   psych, heat sheet(s), finals heat sheet(s), SwimPhone, results PDF, live stream, Relays (coach, pre-meet).
5. Travel — edit icon; rows: ride sign-ups, rooms (link preview), hotel/packing/itinerary (text modal),
   Roommates row (→ /roommates coach, /roommate athlete) + published assignments.
6. Photos — All photos, add button, 4:3 carousel with arrows/count/dots.
- Existing trigger components get optional `trigger?: (open) => ReactNode` render prop.

## Summary section (MeetSheetSummarySection.tsx)
- Toolbar: search, Add menu (coach: Add to roster / Add swim / Add entry — menu kept mounted so modals survive),
  View settings menu: Summary|Roster, By athlete|By event, All|Women|Men, Cozy|Compact rows,
  Show round, Show heat & lane (persist `swimbuzz-summary-row-density`, `swimbuzz-summary-row-info`).
- New `SummaryRow`: event-number badge / avatar, label + sub, line 2 (relay letter | round | heat · lane),
  right: delta pill, mono time, place (podium pill); pending rows: "Seed" pill + seed time + seed rank.
- Roster view: grid rows with avatar, name, "You" pill, event count, gender.
- New `SwimDetailModal` replaces IndividualSplitsModal/RelayDetailModal for summary rows: event badge,
  athlete link, title, round sub-line, time + delta + place; Seed/Heat/Lane grid or two-round comparison table;
  split line chart (SVG) + split table (distance/split, relay swimmer/split, or combined with Δ); Edit relay footer.

## Tokens
- Add `--brand-color-accent` (light #8c6b38, dark #b58d4f) to variables.css, packages/tokens (css + ts),
  mobile variables.ts, globals.css `--color-accent`. Delta/podium colors use existing tailwind palette classes
  (already used across meet components).

## Verify
- `pnpm --filter @swimbuzz/web lint`, `tsc --noEmit`, run dev server and check the page; `graphify update .`.
