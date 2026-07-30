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

# Combined regex
SESSION_HEADER = re.compile(
    rf"^({'|'.join(DAY_NAMES)})(\s*\([^)]+\))?\s*$",
    re.I,
)

SESSION_HEADER_ALT = re.compile(
    r"^(women'?s?\s+)?day\s+\d+|(" + '|'.join(DAY_NAMES) + r")",
    re.I,
)

def _is_session_header(line: str) -> bool:
    line_lower = line.lower()
    # Check for "day" + number
    # A session header like "Day 1 Prelims" will have "day" and "1", but is usually short.
    # Lines with deadlines are likely "Deadline: ... Saturday, November 8th ..."
    # A session header usually looks like "Day 1 Prelims" or "Saturday".
    
    if SESSION_HEADER.match(line):
        return True

    # Let's ensure it's a specific pattern
    # Match "Day X Prelims/Finals" or just "Day X"
    if re.search(r"day\s+\d+", line_lower):
        # Additional constraint: if it's "Day X", it shouldn't have too many other words
        if len(line.split()) <= 4:
            return True
            
    # Also permit day names if they are short (e.g. "Saturday")
    if line_lower.strip() in [d.lower() for d in DAY_NAMES]:
        return True
        
    return False


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
    r"("
    r"relay|freestyle|free|backstroke|back|breaststroke|breastroke|breast|"
    r"butterfly|fly|medley|individual\s+medley|im|\d+\s*x\s*\d+"
    r")",
    re.I,
)

# Trailing footnote markers from meet packets (*, ^, **, ***, †, etc.)
EVENT_NAME_SUFFIX = re.compile(r"[\*^\†‡]+(?:\s*)$")


def _restore_spaces_in_event(name: str) -> str:
    """Restore spaces in event names like '200MedleyRelay' -> '200 Medley Relay'.
    
    Handles cases where pdfplumber removed spaces between words.
    Inserts a space before any uppercase letter that follows a lowercase letter
    or digit (camelCase / run-together words).
    """
    name = name.strip()
    # Insert space between any letter except x/X and a digit.
    name = re.sub(r'([a-wyzA-WYZ])(\d)', r'\1 \2', name)
    # Insert space between a lowercase letter or digit and an uppercase letter.
    # e.g. "200FlipCup"        -> "200 Flip Cup"
    #      "FreestyleRelay"    -> "Freestyle Relay"
    name = re.sub(r'([a-z\d])([A-Z])', r'\1 \2', name)
    return name


def _clean_session_label(label: str) -> str:
    """Clean 'Women’s Day X [Prelims/Finals] Men’s' to 'Day X [Prelims/Finals]'."""
    cleaned = re.sub(r"^women['’]?s?\s+(.*?)\s+men['’]?s?$", r"\1", label, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(women'?s?|men'?s?)\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+(women'?s?|men'?s?)$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _clean_event_name(name: str) -> str:
    name = EVENT_NAME_SUFFIX.sub("", name.strip()).strip()
    return _restore_spaces_in_event(name)


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

    event_raw = _clean_event_name(match.group(2).strip())
    women = int(match.group(1))
    men = int(match.group(3))

    if not _is_event_label(event_raw):
        return None

    return {"women": women, "event": event_raw, "men": men}


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

        if _is_session_header(line):
            current = {"label": _clean_session_label(line), "rows": []}
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


def _is_table_header_row(row: list) -> bool:
    """Return True if this table row is a Women/Event/Men header, not data."""
    if len(row) < 3:
        return False
    header = [str(c or "").replace("\n", " ").strip().lower() for c in row]
    return (
        ("women" in header[0] or "event" in header[0])
        and ("event" in header[1] or "stroke" in header[1])
        and ("men" in header[2] or "event" in header[2])
    )


def _parse_table_fallback(pdf: Any) -> list[dict[str, Any]]:
    """Extract order-of-events from pdfplumber table objects.

    Handles meet packets where:
    - Event names are wrapped across rows (e.g. '100 Individual\\nMedley')
    - Multiple session headers (Saturday/Sunday) appear on the same page
    - Continuation pages have no Women/Event/Men header row
    """
    sessions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    # Collect all pages that either have event keywords OR have any 3-column
    # table (catches continuation pages like page 3 with events 31-42).
    all_page_data: list[tuple[str, list[Any]]] = []
    for page in pdf.pages:
        text = page.extract_text() or ""
        tables = page.extract_tables()
        lower = text.lower()
        has_keywords = (
            "event list" in lower
            or "order of events" in lower
            or "women" in lower
        )
        has_event_tables = any(len(t) > 1 and len(t[0]) >= 3 for t in tables)
        if has_keywords or has_event_tables:
            all_page_data.append((text, tables))

    for text, tables in all_page_data:
        lines = text.split("\n")

        # Collect ALL session headers on this page in order.
        # e.g. page 2 of Raleighwood has both "Saturday" and "Sunday".
        page_session_headers: list[str] = []
        for line in lines:
            ls = line.strip()
            if not ls: continue
            
            if _is_session_header(ls):
                page_session_headers.append(ls)

        # Match each table on this page to its session header.
        # Table i gets header i; extra tables keep the last session.
        for t_idx, table in enumerate(tables):
            if not table:
                continue

            # Advance to a new session if a header exists for this table index.
            if t_idx < len(page_session_headers):
                label = _clean_session_label(page_session_headers[t_idx])
                current = {"label": label, "rows": []}
                sessions.append(current)

            if current is None:
                current = {"label": "Order of Events", "rows": []}
                sessions.append(current)

            # Skip the first row if it's a Women/Event/Men header; otherwise
            # treat all rows as data (handles continuation pages with no header).
            data_rows = table[1:] if _is_table_header_row(table[0]) else table

            for row in data_rows:
                if len(row) < 3:
                    continue
                women_raw = str(row[0] or "").strip()
                event_raw = str(row[1] or "").replace("\n", " ").strip()
                men_raw = str(row[2] or "").strip()
                if not women_raw.isdigit() and not men_raw.isdigit():
                    continue

                if women_raw.isdigit() and men_raw.isdigit():
                    women_val = int(women_raw)
                    men_val = int(men_raw)
                elif women_raw.isdigit():
                    women_val = int(women_raw)
                    men_val = int(women_raw)
                else:
                    women_val = int(men_raw)
                    men_val = int(men_raw)

                if not _is_event_label(event_raw):
                    continue
                current["rows"].append({
                    "women": women_val,
                    "event": _clean_event_name(event_raw),
                    "men": men_val,
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
            # Accumulate all text from relevant pages first to handle sessions
            # that span multiple pages.
            all_lines: list[str] = []
            for page in pdf.pages:
                text = page.extract_text() or ""
                if not _page_has_event_table(text):
                    continue
                all_lines.extend(text.split("\n"))

            if all_lines:
                sessions = _parse_order_page_lines(all_lines)
                sessions = _merge_sessions(sessions)

    if not sessions:
        raise ValueError("No order of events found in PDF")

    return {"sessions": sessions}
