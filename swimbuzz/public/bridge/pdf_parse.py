import io
import re
from typing import Any

import pdfplumber

# Global flag to track if current PDF has Points column (results PDF format)
_PDF_HAS_POINTS_COLUMN = False

# CID ligatures from Hy-Tek PDFs (e.g., "Butter(cid:976)ly" where 976 = 'f')
_CID_LIGATURES = {
    "976": "f",
}

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

RELAY_LEG = re.compile(
    r"(\d)\)\s*"
    r"([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
    r"(?:\s+(\d+))?",
)

# Relay team result line: place, team code, optional A/B/C letter, times.
# e.g. "1 GTSC-GA A 1:52.14 50" — no swimmer name on this row (unlike individual results).
RELAY_TEAM_RESULT = re.compile(
    r"^(\d+)\s+"
    r"((?:[A-Z][A-Za-z]+\s+)*[A-Z][A-Za-z]+(?:-[A-Z]{2})?)\s+"
    r"([ABC])?\s*"
    r"(.+)$",
    re.I,
)

# Legacy pattern kept for leadoff parsing paths that may include a name prefix.
RELAY_RESULT_TEAM = re.compile(
    r"^(\d+)\s+"
    r"(?:.+?\s+)?"
    r"([A-Z0-9]+(?:-[A-Z]{2})?)\s*"
    r"([ABC])?\s*"
    r"(.+)$",
    re.I,
)


MEET_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
# A redundant date prefix some clubs put in the meet name, e.g. "9-27-25 ".
MEET_NAME_DATE_PREFIX = re.compile(r"^\d{1,2}-\d{1,2}-\d{2,4}\s+")

_VALID_RELAY_LETTERS = frozenset({"A", "B", "C", "D"})


def normalize_relay_letter(letter: str | None) -> str | None:
    """Return A–D relay letter, or None when missing / not a team letter."""
    token = (letter or "").strip().upper()
    if token in _VALID_RELAY_LETTERS:
        return token
    return None


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
    # Hy-Tek exhibition prefix — "x1:52.81" — parse the time, no separate tag.
    cleaned = re.sub(r"^[X](?=\d)", "", cleaned)
    if TIME_PATTERN.match(cleaned):
        return cleaned
    return None


def time_token_to_ms(token: str) -> int | None:
    parsed = parse_time_token(token)
    if not parsed:
        return None
    if ":" in parsed:
        parts = parsed.split(":")
        if len(parts) == 2:
            minutes, seconds = parts
            return int(minutes) * 60_000 + int(round(float(seconds) * 1000))
        if len(parts) == 3:
            hours, minutes, seconds = parts
            return (
                int(hours) * 3_600_000
                + int(minutes) * 60_000
                + int(round(float(seconds) * 1000))
            )
        return None
    return int(round(float(parsed) * 1000))


def ms_to_time_token(ms: int) -> str | None:
    if ms <= 0:
        return None
    if ms >= 60_000:
        minutes = ms // 60_000
        seconds = (ms % 60_000) / 1000
        return f"{minutes}:{seconds:05.2f}"
    return f"{ms / 1000:.2f}"


def leg_times_from_cumulative(cumulative_tokens: list[str]) -> dict[int, str]:
    """Individual leg times from cumulative splits at the end of each leg."""
    out: dict[int, str] = {}
    prev_ms = 0
    for leg, token in enumerate(cumulative_tokens, start=1):
        cum_ms = time_token_to_ms(token)
        if cum_ms is None:
            break
        leg_ms = cum_ms - prev_ms
        formatted = ms_to_time_token(leg_ms)
        if formatted:
            out[leg] = formatted
        prev_ms = cum_ms
    return out


def parse_status_token(token: str) -> str | None:
    cleaned = token.strip().upper()
    return cleaned if cleaned in INVALID_TIMES else None


def _append_result_round(
    rounds: list[dict[str, str]], token: str, tags: str
) -> None:
    time_val = parse_time_token(token)
    if time_val:
        rounds.append({"time": time_val, "tags": tags})
        return
    status = parse_status_token(token)
    if status:
        rounds.append({"status": status, "tags": tags})


def strip_points_column(line: str) -> str:
    """Remove the trailing points column from results PDF lines when present.
    
    Results PDFs have format: place name age team seedTime finalTime [points]
    where points is a number (typically 1-40, often X.50 for tied places).
    
    The points column is OPTIONAL - lines for DNF/DQ/DNS or missing points don't have it.
    
    Strategy:
    1. If _PDF_HAS_POINTS_COLUMN flag is True (detected from header), we know points
       MAY be present but are not always there.
    2. Count times by looking for time patterns (MM:SS.HH or SS.HH). 
    3. If exactly 2 times (seed + final), no points value present.
    4. If 3+ times, the last numeric value is likely points, so strip it.
    """
    global _PDF_HAS_POINTS_COLUMN
    
    # Only consider stripping if we detected a Points column in the PDF
    if not _PDF_HAS_POINTS_COLUMN:
        return line
    
    # Count times by looking for time patterns (to avoid infinite recursion with extract_times_from_line)
    time_pattern = r"[xX]?\d{1,2}:\d{2}\.\d{2}|[xX]?\d{2,3}\.\d{2}"
    times = re.findall(time_pattern, line, re.I)
    
    # If exactly 2 times (seed and final), no points value present
    if len(times) == 2:
        return line
    
    # If 3+ times, the last numeric value is likely points - strip it
    match = re.search(r'\s+(\d+(?:\.\d+)?)\s*$', line)
    if match:
        return line[:match.start()]
    
    return line


def extract_times_from_line(line: str) -> list[str]:
    # First strip potential points column
    line_no_points = strip_points_column(line)
    tokens = re.findall(r"[xX]?\d{1,2}:\d{2}\.\d{2}|[xX]?\d{2,3}\.\d{2}", line_no_points, re.I)
    times: list[str] = []
    for token in tokens:
        parsed = parse_time_token(token)
        if parsed:
            times.append(parsed)
    return times


def pick_seed_time(line: str) -> str | None:
    """Seed time from a Hy-Tek result line when seed, prelim, and final are present."""
    cleaned = re.sub(r"\([^)]*\)", " ", line)
    times = extract_times_from_line(cleaned)
    if len(times) >= 3:
        return times[-3]
    return None


def pick_round_times(line: str) -> list[dict[str, str]]:
    """Extract prelim/final (or a single result) from a Hy-Tek result line.

    Hy-Tek prints seed, prelims, and finals as the last three times on the row
    when all three are present. Results PDFs have a trailing points column,
    so we need to distinguish between actual race times and points.
    
    In results PDFs: seed_time final_time points (where points is 1-40 or X.50)
    In other sheets: seed_time prelim_time final_time (or fewer)
    """
    cleaned = re.sub(r"\([^)]*\)", " ", line)
    times = extract_times_from_line(cleaned)
    if not times:
        return []
    
    # Heuristic: if we have exactly 2 times and the line looks like a results entry
    # (has team/age info), then seed=times[0], final=times[1], points is after
    # If we have 3+ times, use the last 2 as prelim/final
    if len(times) == 2:
        # For 2 times: seed and final (results PDF format)
        return [{"time": times[-1], "tags": ""}]
    elif len(times) >= 3:
        # For 3+ times: seed, prelim, final (psych/heat sheet format)
        return [
            {"time": times[-2], "tags": "P"},
            {"time": times[-1], "tags": "F"},
        ]
    return [{"time": times[-1], "tags": ""}]


def pick_result_time(line: str) -> str | None:
    """The swum time is the finals column: Hy-Tek prints "Seed Time Finals Time",
    so take the last time on the line. Parenthesized split times are ignored."""
    rounds = pick_round_times(line)
    if not rounds:
        return None
    for r in reversed(rounds):
        if r.get("tags") == "F":
            return r["time"]
    return rounds[-1]["time"]


def pick_seed_time_column(header: list[str]) -> int | None:
    for i, h in enumerate(header):
        if "seed" in _normalize_table_header(h):
            return i
    return None


def round_time_columns(header: list[str]) -> tuple[int | None, int | None]:
    prelim_idx: int | None = None
    final_idx: int | None = None
    for i, h in enumerate(header):
        if "seed" in h:
            continue
        if "prelim" in h:
            prelim_idx = i
        elif "final" in h:
            final_idx = i
    return prelim_idx, final_idx


def pick_time_column(header: list[str]) -> int | None:
    """Choose the results/finals time column, never the seed column."""
    for keyword in ("final", "result", "swim", "time", "prelim"):
        for i, h in enumerate(header):
            if "seed" in h:
                continue
            if keyword in h:
                return i
    return None


def _normalize_table_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", h.strip().lower())


def parse_heat_lane_token(text: str) -> tuple[int | None, int | None]:
    cleaned = text.strip()
    if not cleaned:
        return None, None
    match = re.match(r"^(\d+)\s*/\s*(\d+)$", cleaned)
    if match:
        heat = int(match.group(1))
        lane = int(match.group(2))
        if heat < 1 and lane < 1:
            return None, None
        if heat < 1:
            return None, lane
        return heat, lane
    return None, None


def heat_lane_columns(header: list[str]) -> tuple[int | None, int | None]:
    """Return (heat_or_htln_idx, lane_idx) when present in a results table."""
    heat_idx: int | None = None
    lane_idx: int | None = None
    for i, h in enumerate(header):
        norm = _normalize_table_header(h)
        if norm in {"htln", "heatlane"} or ("ht" in norm and "ln" in norm):
            return i, None
        if norm == "heat":
            heat_idx = i
        elif norm in {"lane", "ln"}:
            lane_idx = i
    return heat_idx, lane_idx


def cell_heat_lane(
    raw_row: list[Any], heat_idx: int | None, lane_idx: int | None
) -> tuple[int | None, int | None]:
    if heat_idx is None or heat_idx >= len(raw_row):
        return None, None
    if lane_idx is not None and lane_idx < len(raw_row):
        heat_text = str(raw_row[heat_idx] or "").strip()
        lane_text = str(raw_row[lane_idx] or "").strip()
        heat = int(heat_text) if heat_text.isdigit() else None
        lane = int(lane_text) if lane_text.isdigit() else None
        if heat is not None and heat < 1:
            heat = None
        return heat, lane
    return parse_heat_lane_token(str(raw_row[heat_idx] or ""))


def club_matches(club: str, team_norm: str) -> bool:
    """True if a club/team code matches the requested team (tolerates region suffixes).

    Handles both short codes ('GTSC-GA' vs 'gtsc') and full club names
    ('Georgia Tech Swim Club-GA' vs 'gtsc') by trying several strategies:
    1. Exact match after normalisation.
    2. Base code match (strip region suffix).
    3. Full-name: check if any known alias for team_norm appears as a word
       sequence in the club name.
    """
    club_norm = club.strip().lower()
    if not team_norm:
        return True
    if not club_norm:
        return False
    if club_norm == team_norm:
        return True
    if club_norm.split("-")[0] == team_norm.split("-")[0]:
        return True

    # Strategy 3: check club words for known keyword sequences.
    # Build a keyword from the team base (first component before '-').
    team_base = team_norm.split("-")[0]
    # Only apply word-based matching for bases that are >= 4 chars to avoid
    # false positives with very short codes.
    if len(team_base) >= 4:
        # Split team base into constituent words if it looks like an acronym
        # composed of initials — skip (can't word-match an acronym like 'gtsc').
        # Only attempt if the team base itself is found as a substring of the
        # club name words (e.g. 'gtsc' in 'georgia tech swim club').
        club_words = re.sub(r"[^a-z\s]", " ", club_norm).split()
        initials = "".join(w[0] for w in club_words if w)
        if initials == team_base or team_base in initials:
            return True

    return False


def parse_team_from_line(line: str) -> str | None:
    """Extract team/club code from a Hy-Tek-style result line.

    Handles both short codes (e.g. 'GTSC-GA') and full club names
    (e.g. 'Georgia Tech Swim Club-GA') as printed in full-name result PDFs.
    """
    # Try short code first: name + optional age + short code + time/paren
    match = re.search(
        r"(?:[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
        r"(?:\s+\d{1,3})?"
        r"\s+([A-Z0-9]{2,10}(?:-[A-Z]{2})?)"
        r"\s+(?:\(|[\d:xX])",
        line,
    )
    if match:
        return match.group(1).upper()

    # Full team name: title-case multi-word name optionally ending '-XX'
    # e.g. 'Georgia Tech Swim Club-GA' or 'Uncw Club Swim-NC'
    full_match = re.search(
        r"(?:[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
        r"(?:\s+\d{1,3})?"
        r"\s+((?:[A-Z][A-Za-z]+\s+){1,6}(?:[A-Z][A-Za-z]+)(?:-[A-Z]{2})?)"
        r"\s+(?:NT|NQT|DQ|DFS|DNS|SCR|\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2})",
        line,
    )
    if full_match:
        return full_match.group(1).strip()

    return None


def filter_results_by_team(rows: list[dict[str, Any]], team: str | None) -> list[dict[str, Any]]:
    team_norm = (team or "").strip().lower()
    if not team_norm:
        return rows
    filtered: list[dict[str, Any]] = []
    for row in rows:
        row_team = row.get("team")
        if row_team and club_matches(str(row_team), team_norm):
            filtered.append(row)
    return filtered


def parse_place_from_line(line: str) -> int | None:
    """Leading finish place on a Hy-Tek result row."""
    match = re.match(r"^\s*\*?\s*(\d{1,3})\s+(?=[A-Z\"'(])", line)
    if not match:
        return None
    place = int(match.group(1))
    return place if 1 <= place <= 999 else None


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


def _clean_cid_ligatures(line: str) -> str:
    """Replace CID ligatures like (cid:976) with their actual characters (e.g., 'f')."""
    line = re.sub(r"Butter\(cid:\d+\)ly", "Butterfly", line, flags=re.I)
    
    def _replace_cid(match: re.Match[str]) -> str:
        return _CID_LIGATURES.get(match.group(1), "")
    
    line = re.sub(r"\(cid:(\d+)\)", _replace_cid, line)
    return line


def parse_event_from_line(line: str) -> str | None:
    # Clean CID ligatures before parsing (e.g., Butter(cid:976)ly -> Butterfly)
    cleaned_line = _clean_cid_ligatures(line)
    lower = cleaned_line.lower()
    if not any(
        word in lower
        for word in ("free", "back", "breast", "fly", "butterfly", " medley", " im")
    ):
        return None

    match = EVENT_WITH_DISTANCE.search(cleaned_line)
    if not match:
        match = EVENT_LINE.search(cleaned_line)
        if not match:
            return None
        distance, stroke_raw = match.group(1), match.group(2)
        if not distance:
            return None
        return normalize_event(distance, stroke_raw)

    return normalize_event(match.group(1), match.group(2))


def dedupe_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str, str]] = set()
    unique: list[dict[str, Any]] = []
    for row in results:
        key = (
            row["name"].lower(),
            row["event"],
            row["time"],
            row.get("tags") or "",
        )
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
    place_idx = next(
        (i for i, h in enumerate(header) if h in {"place", "pl", "rank", "finish"}),
        None,
    )
    team_idx = next(
        (i for i, h in enumerate(header) if h in {"team", "club", "teamcode", "team code"}),
        None,
    )
    prelim_idx, final_idx = round_time_columns(header)
    seed_idx = pick_seed_time_column(header)
    time_idx = pick_time_column(header)
    heat_idx, lane_idx = heat_lane_columns(header)
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

        event = current_event
        if event_idx is not None and event_idx < len(raw_row):
            event = parse_event_from_line(str(raw_row[event_idx] or "")) or event

        scratch = SCRATCH_MARKER.search(row_text)
        if scratch:
            if not event:
                continue
            place = None
            if place_idx is not None and place_idx < len(raw_row):
                place_text = str(raw_row[place_idx] or "").strip()
                if place_text.isdigit():
                    place = int(place_text)
            team = None
            if team_idx is not None and team_idx < len(raw_row):
                team = str(raw_row[team_idx] or "").strip().upper() or None
            if not team:
                team = parse_team_from_line(row_text)
            rows.append(
                {
                    "name": name,
                    "event": event,
                    "time": scratch.group(0).upper(),
                    "course": course,
                    "tags": "",
                    "place": place,
                    "team": team,
                }
            )
            continue

        rounds: list[dict[str, str]] = []
        if prelim_idx is not None and prelim_idx < len(raw_row):
            _append_result_round(rounds, str(raw_row[prelim_idx] or ""), "P")
        if final_idx is not None and final_idx < len(raw_row):
            _append_result_round(rounds, str(raw_row[final_idx] or ""), "F")

        if not rounds:
            if time_idx is not None and time_idx < len(raw_row):
                _append_result_round(rounds, str(raw_row[time_idx] or ""), "")
            if not rounds:
                time_value = pick_result_time(row_text)
                if time_value:
                    rounds.append({"time": time_value, "tags": ""})
                else:
                    for token in re.findall(r"\b[A-Z]{2,4}\b", row_text.upper()):
                        status = parse_status_token(token)
                        if status:
                            rounds.append({"status": status, "tags": ""})
                            break

        if not rounds or not event:
            continue

        place = None
        if place_idx is not None and place_idx < len(raw_row):
            place_text = str(raw_row[place_idx] or "").strip()
            if place_text.isdigit():
                place = int(place_text)

        team = None
        if team_idx is not None and team_idx < len(raw_row):
            team = str(raw_row[team_idx] or "").strip().upper() or None
        if not team:
            team = parse_team_from_line(row_text)

        heat, lane = cell_heat_lane(raw_row, heat_idx, lane_idx)
        seed_time = None
        if seed_idx is not None and seed_idx < len(raw_row):
            seed_time = parse_time_token(str(raw_row[seed_idx] or ""))
        if not seed_time:
            seed_time = pick_seed_time(row_text)

        for round_time in rounds:
            row: dict[str, Any] = {
                "name": name,
                "event": event,
                "time": round_time.get("time") or round_time.get("status", ""),
                "course": course,
                "tags": round_time.get("tags", ""),
                "place": place,
                "team": team,
            }
            if heat is not None:
                row["heat"] = heat
            if lane is not None:
                row["lane"] = lane
            if seed_time:
                row["seedTime"] = seed_time
            rows.append(row)

    return rows


def _is_split_line(line: str) -> bool:
    """A relay splits line is only split times — digits, colons, dots, spaces."""
    if re.search(r"[A-Za-z)]", line):
        return False
    return len(extract_times_from_line(line)) >= 2


def event_race_distance(event: str) -> int | None:
    """Lead distance from an event name like '200 Free' or '1650 Freestyle'."""
    match = re.match(r"^(\d+)\b", event.strip())
    if not match:
        return None
    distance = int(match.group(1))
    return distance if distance >= 50 else None


def individual_splits_from_tokens(
    tokens: list[str],
    event: str,
    finish_time: str | None = None,
) -> list[dict[str, Any]]:
    """Map Hy-Tek split tokens to [{distance, splitTime}] interval times.

    Cumulative sequences are converted to lap times (same as relay legs).
    Interval (subtracted) sequences are kept as-is.
    """
    if not tokens:
        return []
    distance = event_race_distance(event)
    if distance is None:
        return []

    working = list(tokens)
    ms_vals = [time_token_to_ms(t) for t in working]
    if any(v is None for v in ms_vals):
        return []

    finish = parse_time_token(finish_time or "")
    finish_ms = time_token_to_ms(finish) if finish else None
    total_ms = sum(v for v in ms_vals if v is not None)
    last_ms = ms_vals[-1]
    monotonic = all(ms_vals[i] > ms_vals[i - 1] for i in range(1, len(ms_vals)))

    # Prefer interval when lap times sum to the finish (Hy-Tek "Subtracted" splits).
    looks_interval = finish_ms is not None and abs(total_ms - finish_ms) <= 200
    # Prefer cumulative when the last token matches the finish (Hy-Tek "Cumulative").
    looks_cumulative = (
        not looks_interval
        and finish_ms is not None
        and monotonic
        and abs(last_ms - finish_ms) <= 200
    )
    if finish_ms is None and monotonic and last_ms > ms_vals[0] * 1.8:
        looks_cumulative = True

    if looks_cumulative:
        leg_map = leg_times_from_cumulative(working)
        if not leg_map:
            return []
        count = len(leg_map)
        step = distance // count if count else 50
        return [
            {"distance": step * leg, "splitTime": leg_map[leg]}
            for leg in range(1, count + 1)
        ]

    expected = max(1, distance // 50)
    use = working[:expected] if len(working) >= expected else working
    if not use:
        return []
    step = distance // len(use)
    return [
        {"distance": step * (i + 1), "splitTime": token}
        for i, token in enumerate(use)
    ]


def extract_parenthetical_split_tokens(line: str) -> list[str]:
    """Pull split times from parenthetical groups on a Hy-Tek result line."""
    chunks = re.findall(r"\(([^)]*)\)", line)
    best: list[str] = []
    for chunk in chunks:
        times = extract_times_from_line(chunk)
        if len(times) > len(best):
            best = times
    return best


def parse_text_lines(lines: list[str], course: str) -> list[dict]:
    results: list[dict] = []
    current_event: str | None = None
    last_result_indices: list[int] = []
    # Hy-Tek wraps long races (400+) onto multiple split-only lines; collect
    # consecutive ones before mapping distances (same idea as relay _split_parts).
    pending_split_tokens: list[str] = []

    def attach_splits(tokens: list[str]) -> None:
        if not tokens or not last_result_indices:
            return
        idx = last_result_indices[-1]
        row = results[idx]
        finish = row.get("time") if not parse_status_token(str(row.get("time", ""))) else None
        splits = individual_splits_from_tokens(tokens, str(row.get("event", "")), finish)
        if splits:
            row["splits"] = splits

    def flush_pending_splits() -> None:
        if pending_split_tokens:
            attach_splits(pending_split_tokens)
            pending_split_tokens.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        maybe_event = parse_event_from_line(stripped)
        if maybe_event and len(stripped) < 120:
            flush_pending_splits()
            current_event = maybe_event
            last_result_indices = []
            continue

        if not current_event:
            continue

        split_times = extract_times_from_line(stripped)
        # Continue a multi-row block even if the last row has a single leftover
        # 50 (e.g. 1650 with 33 splits → …4 + 1).
        if not re.search(r"[A-Za-z)]", stripped) and (
            len(split_times) >= 2 or (pending_split_tokens and len(split_times) >= 1)
        ):
            pending_split_tokens.extend(split_times)
            continue

        flush_pending_splits()

        place = parse_place_from_line(stripped)

        name = parse_name_from_line(stripped)
        if not name:
            continue

        team = parse_team_from_line(stripped)
        last_result_indices = []

        scratch = SCRATCH_MARKER.search(stripped)
        if scratch:
            row = {
                "name": name,
                "event": current_event,
                "time": scratch.group(0).upper(),
                "course": course,
                "tags": "",
                "place": place,
                "team": team,
            }
            results.append(row)
            last_result_indices = [len(results) - 1]
            continue

        rounds = pick_round_times(stripped)
        if not rounds:
            continue

        seed_time = pick_seed_time(stripped)
        paren_splits = extract_parenthetical_split_tokens(stripped)
        for round_time in rounds:
            row = {
                "name": name,
                "event": current_event,
                "time": round_time.get("time") or round_time.get("status", ""),
                "course": course,
                "tags": round_time.get("tags", ""),
                "place": place,
                "team": team,
            }
            if seed_time:
                row["seedTime"] = seed_time
            results.append(row)
            last_result_indices.append(len(results) - 1)

        # Parenthetical splits on the result line apply to the last round (finals).
        if paren_splits:
            attach_splits(paren_splits)

    flush_pending_splits()
    return results


def normalize_relay_event(distance: str, stroke_raw: str) -> str | None:
    stroke = stroke_raw.strip().lower()
    if stroke in {"medley", "im"}:
        return f"{distance} Medley Relay"
    if stroke in {"freestyle", "free"}:
        return f"{distance} Free Relay"
    return None


def relay_gender_from_header(line: str) -> str:
    """Women's / men's / mixed from a relay event header line."""
    low = line.lower()
    if re.search(r"\b(women|womens|women's|girls|girl's|female)\b", low):
        return "F"
    if re.search(r"\b(men|mens|men's|boys|boy's|male)\b", low):
        return "M"
    if re.search(r"\bmixed\b", low):
        return "X"
    return ""


def _relay_leg_splits_from_line(line: str, total_distance: int) -> dict[int, str]:
    """Map leg number -> individual leg time from a relay splits line.

    Hy-Tek results PDFs print individual leg times (200 relays: 4 values on one line).
    Longer relays use pairs per leg (50 split, leg total) — take the leg-total column."""
    splits = extract_times_from_line(line)
    if not splits:
        return {}
    leg_distance = total_distance // 4
    values_per_leg = max(1, leg_distance // 50)

    if values_per_leg == 1 and len(splits) >= 4:
        return {leg: splits[leg - 1] for leg in range(1, 5) if leg - 1 < len(splits)}

    out: dict[int, str] = {}
    for leg in range(1, 5):
        idx = leg * values_per_leg - 1
        if idx >= len(splits):
            break
        out[leg] = splits[idx]
    return out


def _merge_relay_swimmers(
    existing: list[dict[str, Any]], legs: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    by_leg = {s["leg"]: s for s in existing}
    for leg in legs:
        by_leg[leg["leg"]] = leg
    return [by_leg[k] for k in sorted(by_leg)]


def _apply_relay_splits(block: dict[str, Any], line: str, event: str) -> None:
    total_match = re.match(r"(\d+)", event)
    if not total_match:
        return
    leg_splits = _relay_leg_splits_from_line(line, int(total_match.group(1)))
    if not leg_splits:
        return
    swimmers = block.get("relaySwimmers") or []
    if swimmers:
        for swimmer in swimmers:
            split = leg_splits.get(swimmer["leg"])
            if split:
                swimmer["splitTime"] = split
    else:
        block["relaySwimmers"] = [
            {"leg": leg, "name": "", "splitTime": split}
            for leg, split in sorted(leg_splits.items())
        ]


def _finish_block_splits(block: dict[str, Any], event: str) -> None:
    parts = block.pop("_split_parts", None)
    if not parts:
        return
    combined = " ".join(parts)
    _apply_relay_splits(block, combined, event)


def parse_relay_results(lines: list[str], course: str) -> list[dict[str, Any]]:
    """Extract relay team results — roster optional; time required.

    Hy-Tek order per team: result line, optional name lines, optional splits line.
    """
    results: list[dict[str, Any]] = []
    current_event: str | None = None
    current_gender: str = ""
    block: dict[str, Any] | None = None

    def flush_block() -> None:
        nonlocal block
        if not block or not current_event:
            block = None
            return
        _finish_block_splits(block, current_event)
        rounds = block.get("rounds") or []
        if not rounds:
            block = None
            return
        swimmers = [dict(s) for s in block.get("relaySwimmers") or []]
        for round_time in rounds:
            row = {
                "entryType": "relay_team",
                "event": current_event,
                "relayLetter": normalize_relay_letter(block.get("relayLetter")),
                "relaySwimmers": swimmers,
                "time": round_time["time"],
                "course": course,
                "tags": round_time.get("tags", ""),
                "place": block.get("place"),
                "team": block.get("team"),
                "gender": current_gender,
            }
            if block.get("seedTime"):
                row["seedTime"] = block["seedTime"]
            results.append(row)
        block = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        relay = RELAY_HEADER.search(line)
        if relay:
            flush_block()
            current_event = normalize_relay_event(relay.group(1), relay.group(2))
            current_gender = relay_gender_from_header(line)
            continue

        if parse_event_from_line(line) and "relay" not in line.lower():
            flush_block()
            current_event = None
            current_gender = ""
            continue

        if not current_event:
            continue

        if line.lower().startswith("team ") and "relay" in line.lower():
            continue

        team_match = RELAY_TEAM_RESULT.match(line)
        if team_match:
            flush_block()
            if SCRATCH_MARKER.search(line):
                continue
            place_str, team_code, letter, tail = team_match.groups()
            rounds = pick_round_times(tail)
            if not rounds:
                continue
            place = int(place_str) if place_str.isdigit() else None
            seed_time = pick_seed_time(tail)
            block = {
                "relayLetter": normalize_relay_letter(letter.upper() if letter else None),
                "team": team_code.upper(),
                "relaySwimmers": [],
                "rounds": rounds,
                "place": place,
            }
            if seed_time:
                block["seedTime"] = seed_time
            continue

        if block and _is_split_line(line):
            block.setdefault("_split_parts", []).append(line)
            continue

        legs = [
            {"leg": int(leg_num), "name": name.strip()}
            for leg_num, name, _age in RELAY_LEG.findall(line)
        ]
        if legs and block:
            block["relaySwimmers"] = _merge_relay_swimmers(
                block.get("relaySwimmers") or [], legs
            )
            continue

    flush_block()
    return results


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
    current_team: str | None = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        team_match = RELAY_TEAM_RESULT.match(line)
        if team_match:
            current_team = team_match.group(2).upper()

        relay = RELAY_HEADER.search(line)
        if relay:
            total = int(relay.group(1))
            leg_distance = total // 4
            stroke = "Back" if relay.group(2).lower() == "medley" else "Free"
            in_relay = True
            leadoff_name = None
            current_team = None
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
                        "team": current_team,
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

    Two-column detection uses two criteria that must both pass:
    1. Very few words physically straddle the page center (the gutter check).
    2. Both the left column and the right column contain substantial independent
       content — specifically, there are many rows whose words stay entirely
       within one half of the page.  A single-column results sheet (names on
       the left, times on the right of the same row) fails this check because
       the majority of rows span from the left margin well past the midpoint or
       extend into the right half without a true gutter between them.
    """
    if not words:
        return None

    mid = page_width / 2.0
    band = page_width * 0.03

    # Criterion 1: few words span the gutter.
    crossing = sum(1 for w in words if w["x0"] < mid - band and w["x1"] > mid + band)
    if crossing > max(5, 0.06 * len(words)):
        return None

    # Criterion 2: each column must have rows that stay entirely within that
    # half.  Group words into rows by y-band, then count rows that are
    # "left-only" (all words end before mid) vs "right-only" (all words start
    # after mid).  For a true 2-column layout both counts should be substantial.
    # For a single-column results sheet most rows span across mid, so the
    # counts will be very low.
    by_y: dict[int, list[dict]] = {}
    for w in words:
        by_y.setdefault(round(float(w["top"]) / 3) * 3, []).append(w)

    left_only = 0
    right_only = 0
    for row_words in by_y.values():
        max_x1 = max(float(w["x1"]) for w in row_words)
        min_x0 = min(float(w["x0"]) for w in row_words)
        if max_x1 <= mid + band:
            left_only += 1
        elif min_x0 >= mid - band:
            right_only += 1

    total_rows = len(by_y)
    # Both columns must account for at least 15 % of rows each.
    threshold = max(3, 0.15 * total_rows)
    if left_only < threshold or right_only < threshold:
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


def parse_meet_pdf_bytes(
    content: bytes, default_course: str = "SCY", team: str | None = None
) -> dict[str, Any]:
    all_text: list[str] = []
    header_lines: list[str] = []
    has_points_column = False

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page_index, page in enumerate(pdf.pages):
            if page_index == 0:
                # The banner/title sit above the two-column body, so the plain
                # top-to-bottom text read gives clean header lines.
                header_lines = (page.extract_text() or "").split("\n")
            # Check if this PDF has a "Points" column (indicates results PDF format)
            page_text = page.extract_text() or ""
            if "Points" in page_text and ("Finals Time" in page_text or "Seed Time" in page_text):
                has_points_column = True
            all_text.extend(extract_page_lines(page))

    # Store this flag in a context variable for use in extract_times_from_line
    global _PDF_HAS_POINTS_COLUMN
    _PDF_HAS_POINTS_COLUMN = has_points_column

    course = detect_course("\n".join(all_text), default_course)
    meet_name, meet_date = parse_meet_header(header_lines or all_text)
    results = filter_results_by_team(parse_text_lines(all_text, course), team)
    relay_results = filter_results_by_team(parse_relay_results(all_text, course), team)

    return {
        "course": course,
        "meet_name": meet_name,
        "meet_date": meet_date,
        "results": dedupe_results(results),
        "relay_results": relay_results,
    }
