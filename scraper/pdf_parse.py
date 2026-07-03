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

# A result carrying one of these markers (e.g. "--- Hancu, Andrei 20 GTSC-GA DQ
# 26.12") is not an official time — Hy-Tek still prints the swum time next to the
# marker, so we must skip the whole row instead of picking that trailing time up.
SCRATCH_MARKER = re.compile(r"(?<![A-Za-z])(?:DQ|DFS|DNF|DNS|SCR)(?![A-Za-z])")

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

# Relay event header, e.g. "Event 1 Girls 200 Yard Medley Relay".
# The distance is the number right before the (optional) course unit + stroke —
# NOT the event number, which can also be 2 digits (e.g. "Event 19 ... Relay").
RELAY_HEADER = re.compile(
    r"\b(\d{2,4})\s+(?:yard|yd|meter|metre|m|scy|lcm|scm)?\s*"
    r"(medley|freestyle|free)\s+relay\b",
    re.I,
)

# Leadoff swimmer of a relay, e.g. "1) Chimidkhorloo, Sarnai 18 2) Mrzyglod, Sabina 22"
LEADOFF_NAME = re.compile(
    r"\b1\s*\)\s*"
    r"([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
)


MEET_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
# A redundant date prefix some clubs put in the meet name, e.g. "9-27-25 ".
MEET_NAME_DATE_PREFIX = re.compile(r"^\d{1,2}-\d{1,2}-\d{2,4}\s+")


def _iso_date(mdy: str) -> str | None:
    match = MEET_DATE.search(mdy)
    if not match:
        return None
    month, day, year = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def parse_meet_header(lines: list[str]) -> tuple[str | None, str | None]:
    """Pull the meet name and date from the Hy-Tek/Meet Manager header.

    Standard layout:
      line 1: "<Venue> ... HY-TEK's MEET MANAGER ... <time> <M/D/YYYY> Page 1"
      line 2: "<Meet Name> - <M/D/YYYY>"   (start date; may be a range)
    """
    candidates = [l.strip() for l in lines[:8] if l.strip()]
    meet_name: str | None = None
    meet_date: str | None = None

    for line in candidates:
        low = line.lower()
        if "hy-tek" in low or "meet manager" in low:
            continue
        if low.startswith("results") or low.startswith("meet "):
            continue

        # First plausible title line wins.
        date_match = MEET_DATE.search(line)
        if date_match:
            name = line[: date_match.start()]
            name = re.sub(r"\s*-\s*$", "", name).strip()
            name = MEET_NAME_DATE_PREFIX.sub("", name).strip()
            meet_name = name or line.strip()
            meet_date = _iso_date(date_match.group(0))
        else:
            meet_name = MEET_NAME_DATE_PREFIX.sub("", line).strip() or line.strip()
        break

    # Fall back to any date in the header (e.g. the Meet Manager print timestamp).
    if not meet_date:
        for line in candidates:
            iso = _iso_date(line)
            if iso:
                meet_date = iso
                break

    return meet_name, meet_date


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


def pick_result_time(line: str) -> str | None:
    """The swum time is the finals column: Hy-Tek prints "Seed Time Finals Time",
    so take the last time on the line. Parenthesized split times are ignored."""
    cleaned = re.sub(r"\([^)]*\)", " ", line)
    times = extract_times_from_line(cleaned)
    if not times:
        return None
    return times[-1]


def pick_time_column(header: list[str]) -> int | None:
    """Choose the results/finals time column, never the seed column."""
    for keyword in ("final", "result", "swim", "time", "prelim"):
        for i, h in enumerate(header):
            if "seed" in h:
                continue
            if keyword in h:
                return i
    return None


def parse_name_from_line(line: str) -> str | None:
    # "1  Frederick Goitia, Luis  19  KSU-GA  32.19"
    # Last name may be multiple words; capture only the first given name so team
    # codes (e.g. "UCFFL-FL") and middle names don't leak into the result.
    comma_match = re.search(
        r"([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*),\s*([A-Z][A-Za-z'\-]+)",
        line,
    )
    if comma_match:
        return f"{comma_match.group(1)}, {comma_match.group(2)}"

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
    time_idx = pick_time_column(header)
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

        row_text = " ".join(str(c or "") for c in raw_row)
        if SCRATCH_MARKER.search(row_text):
            continue

        event = current_event
        if event_idx is not None and event_idx < len(raw_row):
            event = parse_event_from_line(str(raw_row[event_idx] or "")) or event

        time_value = None
        if time_idx is not None and time_idx < len(raw_row):
            time_value = parse_time_token(str(raw_row[time_idx] or ""))

        if not time_value:
            time_value = pick_result_time(" ".join(str(c or "") for c in raw_row))

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

        # Disqualified/scratched swims still print a time; don't import them.
        if SCRATCH_MARKER.search(stripped):
            continue

        time_value = pick_result_time(stripped)
        if not time_value:
            continue

        results.append(
            {
                "name": name,
                "event": current_event,
                "time": time_value,
                "course": course,
            }
        )

    return results


def _is_split_line(line: str) -> bool:
    """A relay splits line is only split times — digits, colons, dots, spaces."""
    if re.search(r"[A-Za-z)]", line):
        return False
    return len(extract_times_from_line(line)) >= 2


def parse_relay_leadoffs(lines: list[str], course: str) -> list[dict]:
    """Extract each relay's leadoff swimmer as an individual time.

    Only the leadoff leg counts as an official individual time (later legs use a
    flying start). Medley relay leadoffs are backstroke; free relay leadoffs are
    freestyle. Each relay entry appears as a team result line, then the swimmer
    names ("1) Last, First ..."), then a per-leg splits line whose first
    value(s) are the leadoff's time."""
    results: list[dict] = []
    in_relay = False
    leg_distance = 0
    stroke: str | None = None
    leadoff_name: str | None = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        relay = RELAY_HEADER.search(line)
        if relay:
            total = int(relay.group(1))
            leg_distance = total // 4
            stroke = "Back" if relay.group(2).lower() == "medley" else "Free"
            in_relay = True
            leadoff_name = None
            continue

        # Any non-relay event header ends the current relay section.
        if parse_event_from_line(line) and "relay" not in line.lower():
            in_relay = False
            leadoff_name = None
            continue

        if not in_relay:
            continue

        name_match = LEADOFF_NAME.search(line)
        if name_match:
            leadoff_name = name_match.group(1)
            continue

        if leadoff_name and stroke and leg_distance > 0 and _is_split_line(line):
            splits = extract_times_from_line(line)
            # Splits are printed every 50 and are cumulative within each leg, e.g.
            # a 400 relay's 100 leg shows "<50 split> <100 time>". So the leadoff's
            # official time is the cumulative value at the end of leg 1 — the
            # (leg_distance / 50)-th split, not the first 50 or a sum of splits.
            values_per_leg = max(1, leg_distance // 50)
            if len(splits) >= values_per_leg:
                time_value = splits[values_per_leg - 1]
                results.append(
                    {
                        "name": leadoff_name,
                        "event": f"{leg_distance} {stroke}",
                        "time": time_value,
                        "course": course,
                        "tags": "R",
                    }
                )
            leadoff_name = None

    return results


def group_words_into_lines(words: list[dict], y_tol: float = 3.0) -> list[str]:
    """Reconstruct text lines from positioned words, one visual row per line."""
    if not words:
        return []
    ordered = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines: list[list[dict]] = [[ordered[0]]]
    ref_top = ordered[0]["top"]
    for word in ordered[1:]:
        if abs(word["top"] - ref_top) <= y_tol:
            lines[-1].append(word)
        else:
            lines.append([word])
            ref_top = word["top"]
    out: list[str] = []
    for line in lines:
        row = sorted(line, key=lambda w: w["x0"])
        out.append(" ".join(w["text"] for w in row))
    return out


def detect_column_split(words: list[dict], page_width: float) -> float | None:
    """Return the x mid-line if the page is two-column, else None (single column).

    Meet Manager result sheets print two side-by-side columns. Detect this by
    checking that very few words straddle the page center (the gutter)."""
    mid = page_width / 2.0
    band = page_width * 0.03
    crossing = sum(1 for w in words if w["x0"] < mid - band and w["x1"] > mid + band)
    if crossing > max(5, 0.06 * len(words)):
        return None
    return mid


def extract_page_lines(page: Any) -> list[str]:
    """Extract lines in human reading order, handling two-column layouts.

    pdfplumber's extract_text() reads across both columns and interleaves
    swimmers from different events. Splitting by column first keeps each
    event's results together so event headers apply to the right swimmers."""
    try:
        words = page.extract_words(use_text_flow=False)
    except Exception:
        words = []
    if not words:
        return (page.extract_text() or "").split("\n")

    mid = detect_column_split(words, float(page.width))
    if mid is None:
        return group_words_into_lines(words)

    left = [w for w in words if (w["x0"] + w["x1"]) / 2.0 < mid]
    right = [w for w in words if (w["x0"] + w["x1"]) / 2.0 >= mid]
    return group_words_into_lines(left) + group_words_into_lines(right)


def parse_meet_pdf_bytes(content: bytes, default_course: str = "SCY") -> dict[str, Any]:
    all_text: list[str] = []
    header_lines: list[str] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page_index, page in enumerate(pdf.pages):
            if page_index == 0:
                # The banner/title sit above the two-column body, so the plain
                # top-to-bottom text read gives clean header lines.
                header_lines = (page.extract_text() or "").split("\n")
            all_text.extend(extract_page_lines(page))

    course = detect_course("\n".join(all_text), default_course)
    meet_name, meet_date = parse_meet_header(header_lines or all_text)
    results = parse_text_lines(all_text, course)
    results.extend(parse_relay_leadoffs(all_text, course))

    return {
        "course": course,
        "meet_name": meet_name,
        "meet_date": meet_date,
        "results": dedupe_results(results),
    }
