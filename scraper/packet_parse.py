"""Parse meet packet PDFs for order-of-events tables."""

from __future__ import annotations

import io
import re
from typing import Any

import pdfplumber

DAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)

SESSION_HEADER = re.compile(
    rf"^({'|'.join(DAY_NAMES)})\s*\([^)]+\)\s*$",
    re.I,
)

TABLE_HEADER = re.compile(r"^women\s+event\s+men$", re.I)
# Alt header used by CCS packets: "Women's Event  Men's Event" or "Women's Event Number"
TABLE_HEADER_ALT = re.compile(
    r"women'?s?\s+event.*men'?s?\s+event|women'?s?\s+event\s+(number|num)\b",
    re.I,
)
ORDER_OF_EVENTS_TITLE = re.compile(
    r"^(order\s+of\s+events|event\s+list)\b",
    re.I,
)
STOP_SECTION = re.compile(
    r"^(notes on the order of events|qualifying times|relay policies|table of contents)\b",
    re.I,
)

# "1 4x200 Freestyle Relay* 2" or "43 4x50 Mixed Freestyle Relay 43"
EVENT_ROW = re.compile(
    r"^(\d+)\s+(.+?)\s+(\d+)\s*$",
    re.I | re.M,
)

EVENT_KEYWORDS = re.compile(
    r"\b("
    r"relay|freestyle|free|backstroke|back|breaststroke|breastroke|breast|"
    r"butterfly|fly|medley|individual\s+medley|\d+\s*x\s*\d+"
    r")\b",
    re.I,
)

# Trailing footnote markers from meet packets (*, ^, **, ***, †, etc.)
EVENT_NAME_SUFFIX = re.compile(r"[\*^\†‡]+(?:\s*)$")


def _clean_event_name(name: str) -> str:
    return EVENT_NAME_SUFFIX.sub("", name.strip()).strip()


def _is_event_label(text: str) -> bool:
    cleaned = text.strip()
    if len(cleaned) < 3:
        return False
    return bool(EVENT_KEYWORDS.search(cleaned))


def _parse_event_row(line: str) -> dict[str, Any] | None:
    stripped = line.strip()
    if not stripped:
        return None

    match = EVENT_ROW.match(stripped)
    if not match:
        return None

    women = int(match.group(1))
    event = match.group(2).strip()
    men = int(match.group(3))

    if not _is_event_label(event):
        return None

    return {"women": women, "event": _clean_event_name(event), "men": men}


def _page_has_event_table(text: str) -> bool:
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    lower = text.lower()
    has_header = any(
        TABLE_HEADER.match(line.replace("  ", " ").strip())
        or TABLE_HEADER_ALT.search(line)
        for line in lines
    )
    event_rows = sum(1 for line in lines if _parse_event_row(line))
    if has_header and event_rows >= 1:
        return True
    if ("order of events" in lower or "event list" in lower) and (has_header or event_rows >= 1):
        return True
    return False


def _parse_order_page_lines(lines: list[str]) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    in_table = False

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if ORDER_OF_EVENTS_TITLE.match(line):
            in_table = True
            continue

        if TABLE_HEADER.match(line.replace("  ", " ").strip()) or TABLE_HEADER_ALT.search(line):
            in_table = True
            continue

        if not in_table:
            continue

        if STOP_SECTION.match(line):
            break

        if SESSION_HEADER.match(line):
            current = {"label": line, "rows": []}
            sessions.append(current)
            continue

        parsed = _parse_event_row(line)
        if not parsed:
            continue

        if current is None:
            current = {"label": "Order of Events", "rows": []}
            sessions.append(current)
        current["rows"].append(parsed)

    return [s for s in sessions if s["rows"]]


def _merge_sessions(sessions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for session in sessions:
        if merged and merged[-1]["label"] == session["label"]:
            merged[-1]["rows"].extend(session["rows"])
        else:
            merged.append({"label": session["label"], "rows": list(session["rows"])})
    return merged


def _parse_table_fallback(pdf: Any) -> list[dict[str, Any]]:
    """Extract order-of-events from pdfplumber table objects.

    Handles meet packets where the event name is wrapped across rows
    (e.g. '100 Individual\\nMedley') so the text-line path cannot reconstruct
    the full name from individual lines.
    """
    sessions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for page in pdf.pages:
        text = page.extract_text() or ""
        # Only process pages that look like an event-list page
        lower = text.lower()
        if "event list" not in lower and "order of events" not in lower and "women" not in lower:
            continue

        for table in page.extract_tables():
            if not table or len(table) < 2:
                continue
            # Detect header row: expect three columns with women / event / men
            header = [str(c or "").replace("\n", " ").strip().lower() for c in table[0]]
            if len(header) < 3:
                continue
            if not (
                ("women" in header[0] or "event" in header[0])
                and ("event" in header[1] or "stroke" in header[1])
                and ("men" in header[2] or "event" in header[2])
            ):
                continue

            if current is None:
                current = {"label": "Order of Events", "rows": []}
                sessions.append(current)

            for row in table[1:]:
                if len(row) < 3:
                    continue
                women_raw = str(row[0] or "").strip()
                event_raw = str(row[1] or "").replace("\n", " ").strip()
                men_raw = str(row[2] or "").strip()
                if not women_raw.isdigit() or not men_raw.isdigit():
                    continue
                if not _is_event_label(event_raw):
                    continue
                current["rows"].append({
                    "women": int(women_raw),
                    "event": _clean_event_name(event_raw),
                    "men": int(men_raw),
                })

    return [s for s in sessions if s["rows"]]


def parse_packet_pdf_bytes(content: bytes) -> dict[str, Any]:
    sessions: list[dict[str, Any]] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        # Primary pass: use pdfplumber table objects.
        # This handles wrapped cells (e.g. "100 Individual\nMedley") and is
        # more reliable than line-by-line text parsing.
        table_sessions = _parse_table_fallback(pdf)
        if table_sessions:
            sessions = _merge_sessions(table_sessions)
        else:
            # Fallback: text-line approach for packets without extractable tables.
            for page in pdf.pages:
                text = page.extract_text() or ""
                if not _page_has_event_table(text):
                    continue
                lines = text.split("\n")
                sessions.extend(_parse_order_page_lines(lines))
            sessions = _merge_sessions(sessions)

    if not sessions:
        raise ValueError("No order of events found in PDF")

    return {"sessions": sessions}
