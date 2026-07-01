import io
import re
from typing import Any

import pdfplumber

STROKE_ALIASES: dict[str, str] = {
    "freestyle": "Free",
    "free": "Free",
    "fr": "Free",
    "backstroke": "Back",
    "back": "Back",
    "bk": "Back",
    "breaststroke": "Breast",
    "breast": "Breast",
    "br": "Breast",
    "butterfly": "Fly",
    "fly": "Fly",
    "fl": "Fly",
    "individual medley": "IM",
    "im": "IM",
    "medley": "IM",
}

TIME_PATTERN = re.compile(r"^\d{1,2}:\d{2}\.\d{2}$|^\d{1,3}\.\d{2}$")
INVALID_TIMES = {"NT", "NS", "DQ", "DFS", "DNF", "SCR"}

EVENT_LINE = re.compile(
    r"(?:(\d{2,4})\s*(?:yard|meter|scy|lcm|scm)?\s*)?"
    r"(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im)\b",
    re.I,
)

EVENT_WITH_DISTANCE = re.compile(
    r"\b(\d{2,4})\s+"
    r"(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im)\b",
    re.I,
)

COURSE_HINT = re.compile(r"\b(SCY|LCM|SCM|short\s+course\s+yards?|long\s+course\s+meters?)\b", re.I)


def normalize_stroke(raw: str) -> str | None:
    key = raw.strip().lower()
    return STROKE_ALIASES.get(key)


def normalize_event(distance: str, stroke_raw: str) -> str | None:
    stroke = normalize_stroke(stroke_raw)
    if not stroke:
        return None
    return f"{distance} {stroke}"


def parse_time_token(token: str) -> str | None:
    cleaned = token.strip().upper()
    if not cleaned or cleaned in INVALID_TIMES:
        return None
    if TIME_PATTERN.match(cleaned):
        return cleaned
    return None


def extract_times_from_line(line: str) -> list[str]:
    tokens = re.findall(r"\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2}", line)
    times: list[str] = []
    for token in tokens:
        parsed = parse_time_token(token)
        if parsed:
            times.append(parsed)
    return times


def parse_name_from_line(line: str) -> str | None:
    # "1  Smith, John  Team  22.34"
    comma_match = re.search(
        r"\b([A-Z][A-Za-z'\-]+,\s*[A-Z][A-Za-z'\-\.]+(?:\s+[A-Z][A-Za-z'\-\.]+)?)",
        line,
    )
    if comma_match:
        return comma_match.group(1).strip()

    # "1  John Smith  Team  22.34" — skip place number, take next two+ capitalized words
    words_match = re.search(
        r"^\s*\d+\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)+)",
        line,
    )
    if words_match:
        name = words_match.group(1).strip()
        # drop trailing team abbrev if it looks like all-caps short token
        parts = name.split()
        if len(parts) >= 3 and parts[-1].isupper() and len(parts[-1]) <= 5:
            name = " ".join(parts[:-1])
        return name

    return None


def detect_course(text: str, default: str = "SCY") -> str:
    match = COURSE_HINT.search(text)
    if not match:
        return default
    value = match.group(1).upper()
    if value in {"SCY", "LCM", "SCM"}:
        return value
    if "LONG" in value:
        return "LCM"
    return "SCY"


def parse_event_from_line(line: str) -> str | None:
    lower = line.lower()
    if not any(
        word in lower
        for word in ("free", "back", "breast", "fly", "butterfly", " medley", " im")
    ):
        return None

    match = EVENT_WITH_DISTANCE.search(line)
    if not match:
        match = EVENT_LINE.search(line)
        if not match:
            return None
        distance, stroke_raw = match.group(1), match.group(2)
        if not distance:
            return None
        return normalize_event(distance, stroke_raw)

    return normalize_event(match.group(1), match.group(2))


def dedupe_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[dict[str, Any]] = []
    for row in results:
        key = (row["name"].lower(), row["event"], row["time"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def parse_table_rows(table: list[list[Any]], current_event: str | None, course: str) -> list[dict]:
    if not table or len(table) < 2:
        return []

    header = [str(c or "").strip().lower() for c in table[0]]
    name_idx = next((i for i, h in enumerate(header) if "name" in h), None)
    time_idx = next(
        (
            i
            for i, h in enumerate(header)
            if any(x in h for x in ("final", "time", "prelim", "result", "swim"))
        ),
        None,
    )
    event_idx = next((i for i, h in enumerate(header) if "event" in h), None)

    if name_idx is None:
        return []

    rows: list[dict] = []
    for raw_row in table[1:]:
        if not raw_row or name_idx >= len(raw_row):
            continue
        name = str(raw_row[name_idx] or "").strip()
        if not name or name.lower() in {"name", "swimmer"}:
            continue

        event = current_event
        if event_idx is not None and event_idx < len(raw_row):
            event = parse_event_from_line(str(raw_row[event_idx] or "")) or event

        time_value = None
        if time_idx is not None and time_idx < len(raw_row):
            time_value = parse_time_token(str(raw_row[time_idx] or ""))

        if not time_value:
            line_times = extract_times_from_line(" ".join(str(c or "") for c in raw_row))
            time_value = line_times[0] if line_times else None

        if not event or not time_value:
            continue

        rows.append({"name": name, "event": event, "time": time_value, "course": course})

    return rows


def parse_text_lines(lines: list[str], course: str) -> list[dict]:
    results: list[dict] = []
    current_event: str | None = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        maybe_event = parse_event_from_line(stripped)
        if maybe_event and len(stripped) < 120:
            current_event = maybe_event
            continue

        if not current_event:
            continue

        name = parse_name_from_line(stripped)
        if not name:
            continue

        times = extract_times_from_line(stripped)
        if not times:
            continue

        results.append(
            {
                "name": name,
                "event": current_event,
                "time": times[0],
                "course": course,
            }
        )

    return results


def parse_meet_pdf_bytes(content: bytes, default_course: str = "SCY") -> dict[str, Any]:
    results: list[dict] = []
    all_text: list[str] = []
    current_event: str | None = None

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            page_lines = page_text.split("\n")
            all_text.extend(page_lines)

            for line in page_lines:
                maybe_event = parse_event_from_line(line)
                if maybe_event:
                    current_event = maybe_event

            course = detect_course(page_text, default_course)

            for table in page.extract_tables() or []:
                results.extend(parse_table_rows(table, current_event, course))

    full_text = "\n".join(all_text)
    course = detect_course(full_text, default_course)
    results.extend(parse_text_lines(all_text, course))

    return {
        "course": course,
        "results": dedupe_results(results),
    }
