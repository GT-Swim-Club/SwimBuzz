import contextvars
import io
import re
from typing import Any

import pdfplumber

from .swim_common import (
    EXHIBITION_TIME_TOKEN_PATTERN,
    INVALID_TIME_PATTERN,
    INVALID_TIMES,
    TIME_TOKEN_PATTERN,
    expand_ligatures,
    leg_times_from_cumulative,
    normalize_event,
    normalize_relay_letter,
    parse_status_token,
    parse_time_token,
    time_token_to_ms,
)

# Per-invocation flag (not a plain global — concurrent serverless requests
# must not see each other's PDF's column layout) tracking whether the
# current PDF has a Points column (results PDF format).
_pdf_has_points_column: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "_pdf_has_points_column", default=False
)

# CID ligatures from Hy-Tek PDFs (e.g., "Butter(cid:976)ly" where 976 = 'f')
_CID_LIGATURES = {
    "976": "f",
}

# A result carrying one of these markers (e.g. "--- Hancu, Andrei 20 GTSC-GA DQ
# 26.12") is not an official time — Hy-Tek still prints the swum time next to the
# marker, so we must skip the whole row instead of picking that trailing time up.
# NT/NQT are excluded — those mean "no time" in a *seed*-time context, not a
# scratched race, and don't appear as an official-result marker.
_SCRATCH_STATUS_TOKENS = INVALID_TIMES - {"NT", "NQT"}
SCRATCH_MARKER = re.compile(
    rf"(?<![A-Za-z])(?:{'|'.join(sorted(_SCRATCH_STATUS_TOKENS, key=len, reverse=True))})(?![A-Za-z])"
)

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

# Relay event header, e.g. "Event 1 Girls 200 Yard Medley Relay" or
# USMS/CCS "#1 Women 4x200 Yard Free Relay". Optional Nx prefix is the
# number of legs; without it the leading distance is the total (4x50 = 200).
RELAY_HEADER = re.compile(
    r"(?:(\d+)\s*[x×]\s*)?(\d{2,4})\s+(?:yard|yd|meter|metre|m|scy|lcm|scm)?\s*"
    r"(medley|freestyle|free)\s+relay\b",
    re.I,
)

# Combined results: A/B/C finals in one column, prelims in another.
_ROUND_PRELIM_SECTION = re.compile(
    r"Preliminar(?:y|ies)\b|\bPrelims?\b|Prelim(?:s)?\s*Time|TeamPrelim",
    re.I,
)
_ROUND_ABC_FINAL = re.compile(r"[ABCD]\s*-\s*Finals?\b", re.I)
_ROUND_BARE_FINAL = re.compile(r"^Finals?\s*$", re.I)

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

# Relay team result line: place, team code, optional A-D letter, times.
# e.g. "1 GTSC-GA A 1:52.14 50" — no swimmer name on this row (unlike individual
# results). Place is normally numeric, but a scratched relay ("--- AUB-SE C
# NS") prints the scratch marker where the place would be — accept it so the
# scratched row is recognized (and its stale swimmer-roster block flushed)
# instead of falling through unrecognized and letting the next team's roster
# lines merge into whatever relay was parsed last.
RELAY_TEAM_RESULT = re.compile(
    r"^(\d+|-{2,3})\s+"
    r"((?:[A-Z][A-Za-z]+\s+)*[A-Z][A-Za-z]+(?:-[A-Z]{2})?)\s+"
    r"([ABCD])?\s*"
    r"(.+)$",
    re.I,
)


_HYTEK_BANNER = re.compile(r"hy-tek|meet manager", re.I)

MEET_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})\b")
_MONTH_NAMES: dict[str, int] = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}
# Month-name dates some championship cover pages use in place of M/D/YYYY,
# e.g. "November 8-9, 2025" or "Nov. 8, 2025".
MEET_DATE_MONTH_NAME = re.compile(
    r"\b(" + "|".join(sorted(_MONTH_NAMES, key=len, reverse=True)) + r")\.?\s+"
    r"(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?,?\s+"
    r"(\d{4})\b",
    re.I,
)
# A redundant date prefix some clubs put in the meet name, e.g. "9-27-25 ".
MEET_NAME_DATE_PREFIX = re.compile(r"^\d{1,2}-\d{1,2}-\d{2,4}\s+")

DOC_PSYCH = re.compile(r"Psych\s+Sheet", re.I)
DOC_HEAT = re.compile(r"Meet\s+Program", re.I)
DOC_ENTRIES = re.compile(
    r"Team Entries|Individual Meet Entries|Entry Report(?:\s+by\s+Club)?|"
    r"Entries Report|Meet Entries Report",
    re.I,
)
DOC_RESULTS = re.compile(r"^Results\b|\bResults\s*[-–:]", re.I)
DOC_PACKET = re.compile(
    r"Order of Events|Notes on the Order of Events|"
    r"Women'?s Event(?:\s+Number)?\s+Men'?s Event|"
    r"\bEvent List\b|\bTable of Contents\b",
    re.I,
)

# Structural (not banner-text) signals used to break ties on doc-type score —
# a packet's order-of-events table looks like this even when its title banner
# is buried past the classifier's header window, and a results table has this
# column shape even when the page never prints the word "Results".
PACKET_TABLE_HEADER_SHAPE = re.compile(
    r"\b(?:women[’']?s?|girls?|w)\s*[\s|]{1,4}event\s*(?:number|num)?\s*[\s|]{1,4}(?:men[’']?s?|boys?|m)\b",
    re.I,
)
# A numbered order-of-events row: "<women's #> <event name with a stroke
# keyword> <men's #>", e.g. "1 200 Freestyle Relay* 2" or "23 400 IM* 24".
# Requires a stroke/relay keyword so results rows (which end in a time, not a
# bare number) never match.
PACKET_EVENT_ROW_SHAPE = re.compile(
    r"^\s*\d{1,3}\s+.*?(?:relay|freestyle|free|backstroke|back|breaststroke|breast|"
    r"butterfly|fly|medley|individual\s+medley|im).*?\d{1,3}\*?\s*$",
    re.I,
)
RESULTS_TABLE_SHAPE_PLACE = re.compile(r"\bPlace\b", re.I)
RESULTS_TABLE_SHAPE_FINALS = re.compile(r"Finals\s+Time", re.I)

# Doc types in priority order — used both as scoring dict iteration order
# (ties resolve to the first-listed type, preserving old first-match-wins
# behaviour) and to name every candidate even when its score is 0.
_DOC_TYPES = ("entries", "heat", "psych", "results", "packet")

_HEADER_WINDOW_LINES = 20
_HEADER_WEIGHT = 10
_BODY_WEIGHT = 1
_SHAPE_WEIGHT = 6


def _weighted_line_hits(lines: list[str], pattern: re.Pattern[str]) -> float:
    """Score matches of `pattern` across `lines`, weighting an early hit (a
    page banner/title) far above the same phrase turning up later in body
    prose — e.g. a packet's cover page mentioning "see the psych sheet for
    seed times" shouldn't outweigh its own "Order of Events" table title."""
    score = 0.0
    seen_non_blank = 0
    for line in lines:
        if not line.strip():
            continue
        seen_non_blank += 1
        hits = len(pattern.findall(line))
        if not hits:
            continue
        weight = _HEADER_WEIGHT if seen_non_blank <= _HEADER_WINDOW_LINES else _BODY_WEIGHT
        score += hits * weight
    return score


def detect_hytek_doc_type(text: str) -> str:
    """Classify a meet PDF: psych|heat|entries|results|packet|unknown.

    Scores every doc type over the *whole* document — not just the first few
    thousand characters — since a packet's "Order of Events" table or a
    championship program's Hy-Tek header can start several pages in (a
    non-Hy-Tek cover page, a long table of contents). A hit in a page
    header/title position counts far more than the same phrase in body prose,
    and two structural shape signals (a women/event/men table for packets, a
    Place + Finals Time column pair for results) break ties that banner text
    alone can't, since they rest on the document's shape rather than one
    string that might appear anywhere.
    """
    lines = text.split("\n")

    scores: dict[str, float] = {doc_type: 0.0 for doc_type in _DOC_TYPES}
    scores["entries"] += _weighted_line_hits(lines, DOC_ENTRIES)
    scores["heat"] += _weighted_line_hits(lines, DOC_HEAT)
    scores["psych"] += _weighted_line_hits(lines, DOC_PSYCH)
    scores["results"] += _weighted_line_hits(lines, DOC_RESULTS)
    scores["packet"] += _weighted_line_hits(lines, DOC_PACKET)

    if PACKET_TABLE_HEADER_SHAPE.search(text):
        scores["packet"] += _SHAPE_WEIGHT
    event_row_hits = sum(1 for line in lines if PACKET_EVENT_ROW_SHAPE.match(line.strip()))
    if event_row_hits >= 2:
        scores["packet"] += _SHAPE_WEIGHT
    if RESULTS_TABLE_SHAPE_PLACE.search(text) and RESULTS_TABLE_SHAPE_FINALS.search(text):
        scores["results"] += _SHAPE_WEIGHT

    best_type = max(_DOC_TYPES, key=lambda doc_type: scores[doc_type])
    if scores[best_type] <= 0:
        return "unknown"
    return best_type


def _expand_2digit_year(year: int) -> int:
    return 2000 + year if year < 70 else 1900 + year


def _find_date(text: str) -> tuple[int, int, str] | None:
    """Return (start, end, iso_date) for the earliest recognized date in
    `text` — either M/D/YYYY (also M/D/YY) or a month-name date like
    "November 8-9, 2025" — or None if neither pattern matches."""
    best: tuple[int, int, str] | None = None

    slash_match = MEET_DATE.search(text)
    if slash_match:
        month, day, year_s = slash_match.groups()
        year = int(year_s) if len(year_s) == 4 else _expand_2digit_year(int(year_s))
        iso = f"{year:04d}-{int(month):02d}-{int(day):02d}"
        best = (slash_match.start(), slash_match.end(), iso)

    month_match = MEET_DATE_MONTH_NAME.search(text)
    if month_match and (best is None or month_match.start() < best[0]):
        month_name, day, year = month_match.groups()
        month = _MONTH_NAMES[month_name.lower().rstrip(".")]
        iso = f"{int(year):04d}-{month:02d}-{int(day):02d}"
        best = (month_match.start(), month_match.end(), iso)

    return best


def _iso_date(text: str) -> str | None:
    found = _find_date(text)
    return found[2] if found else None


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
        found = _find_date(line)
        if found:
            start, _end, iso = found
            name = line[:start]
            name = re.sub(r"\s*-\s*$", "", name).strip()
            name = MEET_NAME_DATE_PREFIX.sub("", name).strip()
            meet_name = name or line.strip()
            meet_date = iso
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
    # Only consider stripping if we detected a Points column in the PDF
    if not _pdf_has_points_column.get():
        return line
    
    # Count times by looking for time patterns (to avoid infinite recursion with extract_times_from_line)
    times = re.findall(EXHIBITION_TIME_TOKEN_PATTERN, line, re.I)
    
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
    tokens = re.findall(EXHIBITION_TIME_TOKEN_PATTERN, line_no_points, re.I)
    times: list[str] = []
    for token in tokens:
        parsed = parse_time_token(token)
        if parsed:
            times.append(parsed)
    return times


def pick_seed_time(line: str) -> str | None:
    """Seed time from a Hy-Tek result line when seed, prelim, and final are present.

    Only applicable for heat/psych sheets where 3 large times appear (seed, prelim, final).
    For results PDFs we typically only have 1-2 large times, so no seed is returned.
    """
    cleaned = re.sub(r"\([^)]*\)", " ", line)
    times = extract_times_from_line(cleaned)
    result_scale = [t for t in times if _is_result_scale_time(t)]
    if len(result_scale) >= 3:
        return result_scale[-3]
    return None


def _is_result_scale_time(token: str) -> bool:
    """Return True if the time token is plausibly a full-race result (not a 50-yard split).
    
    50-yard splits are typically < 35 seconds.  A result time for ANY event >= 100y
    will be >= ~35s, and even for a 50 Free the finals time is >=  ~18s.
    We use a conservative threshold of 35 seconds (35000ms) — any time under this
    must be a split or a 50-yard result, which is fine for 50 events but would be
    suspicious as a main result for a longer event.
    
    This is only used to distinguish column-bleed splits from results times when
    multiple time tokens appear on one result row.
    """
    ms = time_token_to_ms(token)
    return ms is not None and ms >= 35000


def pick_round_times(line: str) -> list[dict[str, str]]:
    """Extract prelim/final (or a single result) from a Hy-Tek result line.

    Hy-Tek prints seed, prelims, and finals as the last three times on the row
    when all three are present. Results PDFs have a trailing points column,
    so we need to distinguish between actual race times and points.
    
    In results PDFs: seed_time final_time [column-bleed splits]
    In psych/heat sheets: seed_time prelim_time final_time (or fewer)
    
    Column-bleed problem (3-column layouts): When a PDF uses 2 or 3 columns,
    the 50-yard split times printed below an adjacent column's result rows can
    bleed onto the same text line as a result from another column.  These bleed
    values are always small (< 35 seconds), so if we see a large time followed
    by small times, the large time is the result and the small ones are splits.
    """
    cleaned = re.sub(r"\([^)]*\)", " ", line)
    times = extract_times_from_line(cleaned)
    if not times:
        return []

    if len(times) == 1:
        return [{"time": times[0], "tags": ""}]

    if len(times) == 2:
        # Could be: seed+final, or final+bleed-split, or two bleed splits.
        # If the first time is large (result-scale) and second is small (split-scale),
        # the second is a column-bleed — treat as just a single result.
        if _is_result_scale_time(times[0]) and not _is_result_scale_time(times[1]):
            return [{"time": times[0], "tags": ""}]
        # Otherwise: seed and final (the common case).
        return [{"time": times[-1], "tags": ""}]

    # 3+ times on the line.
    # Identify which times are "result-scale" (>= 35s) and which are "split-scale".
    result_scale = [t for t in times if _is_result_scale_time(t)]
    
    if len(result_scale) == 1:
        # Exactly one large time — it is the result; the rest are splits or column bleeds.
        return [{"time": result_scale[0], "tags": ""}]
    
    if len(result_scale) == 2:
        # Two large times: could be seed + final (results PDF) or prelim + final.
        # In a results PDF we only want the final; in psych/heat sheet we want both.
        # Since results PDFs use a single Finals Time column we return just the last
        # large time (the final) — this matches historical behaviour for 2-time lines.
        return [{"time": result_scale[-1], "tags": ""}]
    
    if len(result_scale) >= 3:
        # Three or more large times: seed, prelim, final (heat sheet / psych sheet).
        return [
            {"time": result_scale[-2], "tags": "P"},
            {"time": result_scale[-1], "tags": "F"},
        ]

    # All times are small (split-scale): this is a 50-yard event where the result
    # time is < 35s, and the subsequent times are column-bleed splits from an adjacent
    # event.  Take the first time as the result.
    return [{"time": times[0], "tags": ""}]


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
    4. Prefix match: the club name may be an abbreviated prefix of the full
       club name whose acronym is the team code (e.g. 'Georgia Tech' is a
       prefix of 'Georgia Tech Swim Club', whose acronym is 'gtsc').
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
    club_base = club_norm.split("-")[0]
    
    # Only apply word-based matching for bases that are >= 4 chars to avoid
    # false positives with very short codes.
    if len(team_base) >= 4 or len(club_base) >= 4:
        # Normalize both club and team to just alphanumeric + spaces
        club_words = re.sub(r"[^a-z\s]", " ", club_base).split()
        team_words = re.sub(r"[^a-z\s]", " ", team_base).split()
        
        # Check if the club name contains the team name as a word sequence
        # e.g., "georgia tech swim club" in "georgia tech swim club-ga"
        if team_words and len(team_words) > 1:
            # Multi-word team name: check if it appears as a subsequence in club
            club_text = " ".join(club_words)
            team_text = " ".join(team_words)
            if team_text in club_text:
                return True
        
        # Check if the team name contains the club name as a word sequence
        # e.g., "gtsc" in "georgia tech swim club"
        if club_words and len(club_words) > 1:
            # Multi-word club name: check if it appears as a subsequence in team
            club_text = " ".join(club_words)
            team_text = " ".join(team_words)
            if club_text in team_text:
                return True
        
        # Check if team is an acronym of the club name
        # e.g., 'gtsc' matches 'georgia tech swim club'
        club_initials = "".join(w[0] for w in club_words if w)
        if club_initials == team_base or team_base in club_initials:
            return True
        
        # Check if club is an acronym of the team name (reverse check)
        # e.g., 'GTSC-GA' matches 'georgia tech swim club'
        team_initials = "".join(w[0] for w in team_words if w)
        if team_initials == club_base or club_base in team_initials:
            return True

        # Strategy 4: prefix match — the club words are the leading words of a
        # longer name whose full acronym equals the team base code.
        # e.g. club='georgia tech' (initials 'gt') and team='gtsc' (4 letters)
        # → 'georgia tech' starts with 'g' and 't', first two letters of 'gtsc'.
        # Accept if the club words are a prefix of the initialism expansion.
        if len(club_words) >= 2:
            prefix_initials = "".join(w[0] for w in club_words if w)
            if team_base.startswith(prefix_initials):
                return True

    return False


def parse_team_from_line(line: str) -> str | None:
    """Extract team/club code from a Hy-Tek-style result line.

    Handles both short codes (e.g. 'GTSC-GA') and full club names
    (e.g. 'Georgia Tech Swim Club-GA') as printed in full-name result PDFs.
    Also handles cases where age is concatenated with team code (e.g. '18GTSC').
    """
    # Try short code with concatenated age+team: name + age+team (no space) + time/paren
    # e.g. "Smith, Benjamin 18GTSC 1:52.91"
    concat_match = re.search(
        r"(?:[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
        r"\s+\d{1,3}([A-Z0-9]{2,10}(?:-[A-Z]{2})?)"
        r"\s+(?:\(|[\d:xX])",
        line,
    )
    if concat_match:
        return concat_match.group(1).upper()
    
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
        rf"\s+(?:{INVALID_TIME_PATTERN}|{TIME_TOKEN_PATTERN})",
        line,
    )
    if full_match:
        return full_match.group(1).strip()

    return None


def filter_results_by_team(rows: list[dict[str, Any]], team: str | None) -> list[dict[str, Any]]:
    """Filter results to only include rows matching any of the provided team codes.
    
    Args:
        rows: List of result dictionaries with 'team' field
        team: Single team code or comma-separated list of team codes (e.g. "GTSC, Georgia Tech Swim Club")
    
    Returns:
        Filtered list containing only rows matching one of the team codes
    """
    team_input = (team or "").strip()
    if not team_input:
        return rows
    
    # Split by comma to support multiple team codes
    team_codes = [t.strip().lower() for t in team_input.split(",") if t.strip()]
    if not team_codes:
        return rows
    
    filtered: list[dict[str, Any]] = []
    for row in rows:
        row_team = row.get("team")
        if row_team:
            # Check if row team matches ANY of the provided team codes
            if any(club_matches(str(row_team), team_code) for team_code in team_codes):
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
        # An unmapped CID must never silently vanish — deleting it merges two
        # words together (e.g. "Ofﬁcial" -> "Ocial", a different real word).
        # A replacement character at least preserves word length/boundaries.
        return _CID_LIGATURES.get(match.group(1), "�")

    line = re.sub(r"\(cid:(\d+)\)", _replace_cid, line)
    return expand_ligatures(line)


def parse_event_from_line(line: str) -> str | None:
    """Extract swim event from a header line.
    
    Returns None if the line contains multiple event headers (cross-column headers),
    as these shouldn't override the current event context."""
    # Clean CID ligatures before parsing (e.g., Butter(cid:976)ly -> Butterfly)
    cleaned_line = _clean_cid_ligatures(line)
    lower = cleaned_line.lower()
    if not any(
        word in lower
        for word in ("free", "back", "breast", "fly", "butterfly", " medley", " im")
    ):
        return None
    # Relay headers are owned by RELAY_HEADER ("4x200 Yard Free" would otherwise
    # look like an individual 200 Free).
    if "relay" in lower:
        return None

    # Check for multiple event numbers on one line (e.g., "#18 Boys... #21 Girls...")
    # These are cross-column headers and should be ignored for event tracking
    event_number_pattern = r'#\d+'
    event_numbers = re.findall(event_number_pattern, cleaned_line)
    if len(event_numbers) > 1:
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
    current_round: str | None = None
    last_result_indices: list[int] = []
    in_relay_section: bool = False
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

        round_tag = parse_round_section(stripped)
        if round_tag is not None:
            current_round = round_tag

        # Relay-event headers: track that we're in a relay block so relay team
        # lines (e.g. "1 UNC Chapel Hill-NC A 1:42.53") are not mistakenly parsed
        # as individual-athlete results.  parse_relay_results() owns those lines.
        if relay_header_match(stripped):
            flush_pending_splits()
            in_relay_section = True
            last_result_indices = []
            continue

        maybe_event = parse_event_from_line(stripped)
        if maybe_event and len(stripped) < 120:
            flush_pending_splits()
            current_event = maybe_event
            in_relay_section = False
            last_result_indices = []
            # New event without a round header (not "Preliminaries ... (#3 ...)")
            # — wait for A-Final / Preliminaries before tagging P/F.
            if round_tag is None:
                current_round = None
            continue

        if round_tag is not None and not parse_name_from_line(stripped):
            continue

        # Skip lines that belong to a relay section (handled by parse_relay_results).
        if in_relay_section:
            continue

        if not current_event:
            continue

        # Skip relay team result lines: they match "place  TEAM-CODE  [letter]  time"
        # but have no comma-separated "LastName, FirstName" pattern.
        if RELAY_TEAM_RESULT.match(stripped) and not re.search(r"[A-Z][a-z]+,", stripped):
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
                "tags": current_round or "",
                "place": place,
                "team": team,
            }
            results.append(row)
            last_result_indices = [len(results) - 1]
            continue

        rounds = apply_section_round(pick_round_times(stripped), current_round)
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


def relay_header_match(line: str) -> re.Match[str] | None:
    return RELAY_HEADER.search(line)


def relay_event_from_header(line: str) -> str | None:
    """Event name from a relay header, including USMS 4x200 → 800 Free Relay."""
    match = relay_header_match(line)
    if not match:
        return None
    legs, distance, stroke_raw = match.group(1), match.group(2), match.group(3)
    total = str(int(legs) * int(distance)) if legs else distance
    return normalize_relay_event(total, stroke_raw)


def parse_round_section(line: str) -> str | None:
    """Prelim/final section from Hy-Tek combined-results headers.

    Returns "P" or "F" when the line declares a round, else None.
    Timed-finals titles are ignored so those meets keep untagged official times.
    """
    stripped = line.strip()
    if not stripped:
        return None
    if re.search(r"Timed\s+Finals?", stripped, re.I):
        return None
    if _ROUND_PRELIM_SECTION.search(stripped):
        return "P"
    if _ROUND_ABC_FINAL.search(stripped):
        return "F"
    if _ROUND_BARE_FINAL.match(stripped):
        return "F"
    return None


def apply_section_round(
    rounds: list[dict[str, str]], section_round: str | None
) -> list[dict[str, str]]:
    """Fill empty tags from A-Final / Preliminaries section context."""
    if not section_round:
        return rounds
    out: list[dict[str, str]] = []
    for item in rounds:
        tags = (item.get("tags") or "").strip()
        if tags in {"P", "F"}:
            out.append(item)
        else:
            out.append({**item, "tags": section_round})
    return out


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


def _relay_leg_splits_from_line(
    line: str, total_distance: int
) -> dict[int, dict[str, Any]]:
    """Map leg number -> {splitTime, splits?} from a relay splits line.

    Hy-Tek results PDFs print individual leg times (200 relays: 4 values on one line).
    Longer relays print cumulative-within-leg marks every 50 (e.g. 50 + 100 per leg).
    Intermediate 50s are stored as interval splits; splitTime is the full leg time.
    """
    tokens = extract_times_from_line(line)
    if not tokens:
        return {}
    leg_distance = total_distance // 4
    values_per_leg = max(1, leg_distance // 50)

    out: dict[int, dict[str, Any]] = {}

    if values_per_leg == 1 and len(tokens) >= 4:
        for leg in range(1, 5):
            if leg - 1 >= len(tokens):
                break
            out[leg] = {"splitTime": tokens[leg - 1]}
        return out

    for leg in range(1, 5):
        start = (leg - 1) * values_per_leg
        end = start + values_per_leg
        if end > len(tokens):
            break
        leg_tokens = tokens[start:end]
        leg_total = leg_tokens[-1]
        entry: dict[str, Any] = {"splitTime": leg_total}
        if values_per_leg > 1:
            # Tokens are cumulative within the leg; convert to interval 50s.
            interval_map = leg_times_from_cumulative(leg_tokens)
            if interval_map:
                entry["splits"] = [
                    {"distance": 50 * i, "splitTime": interval_map[i]}
                    for i in range(1, len(interval_map) + 1)
                ]
        out[leg] = entry
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
            detail = leg_splits.get(swimmer["leg"])
            if not detail:
                continue
            if detail.get("splitTime"):
                swimmer["splitTime"] = detail["splitTime"]
            if detail.get("splits"):
                swimmer["splits"] = detail["splits"]
    else:
        block["relaySwimmers"] = [
            {
                "leg": leg,
                "name": "",
                "splitTime": detail["splitTime"],
                **({"splits": detail["splits"]} if detail.get("splits") else {}),
            }
            for leg, detail in sorted(leg_splits.items())
            if detail.get("splitTime")
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
    current_round: str | None = None
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

        round_tag = parse_round_section(line)
        if round_tag is not None:
            current_round = round_tag

        event = relay_event_from_header(line)
        if event:
            flush_block()
            current_event = event
            current_gender = relay_gender_from_header(line)
            if round_tag is None:
                current_round = None
            continue

        if parse_event_from_line(line) and "relay" not in line.lower():
            flush_block()
            current_event = None
            current_gender = ""
            current_round = None
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
            rounds = apply_section_round(pick_round_times(tail), current_round)
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

        # Try explicit leg format (1), 2)...)
        found_legs = [
            {"leg": int(leg_num), "name": name.strip()}
            for leg_num, name, _age in RELAY_LEG.findall(line)
        ]
        
        # Try result format (Name, Name Age)
        if not found_legs:
            matches = re.findall(r"([A-Za-z'\-]+,\s*[A-Za-z'\-]+)(?:\s+(\d+))?", line)
            
            if matches and block:
                # Use current length of relaySwimmers to assign leg numbers
                current_swimmers = block.setdefault("relaySwimmers", [])
                start_leg = len(current_swimmers) + 1
                for i, (name, age) in enumerate(matches):
                    new_leg = {
                        "leg": start_leg + i,
                        "name": name.strip(),
                        "age": int(age) if age else None
                    }
                    found_legs.append(new_leg)
                    # Update block immediately
                    current_swimmers.append(new_leg)
        
        if found_legs and block:
            block["relaySwimmers"] = _merge_relay_swimmers(
                block.get("relaySwimmers") or [], found_legs
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

        event = relay_event_from_header(line)
        if event:
            total_match = re.match(r"(\d+)", event)
            total = int(total_match.group(1)) if total_match else 0
            leg_distance = total // 4
            stroke = "Back" if "medley" in event.lower() else "Free"
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
        out.append(_clean_cid_ligatures(" ".join(w["text"] for w in row)))
    return out


def detect_column_split(
    words: list[dict],
    page_width: float,
    lines: list[dict] | None = None,
    page_height: float | None = None,
) -> list[float]:
    """Return list of column boundaries (x-coordinates) for multi-column layouts.
    
    Returns empty list for single-column, or list of split points for 2+ columns.
    For 2 columns: returns [midpoint]
    For 3 columns: returns [1/3 point, 2/3 point]
    
    Can also use visual separators (vertical lines) to detect columns when word
    distribution analysis is inconclusive.
    """
    if not words:
        return []

    # A vertical line's length should be compared against the page's height,
    # not its width — those can differ a lot on a landscape or letter page,
    # which either missed genuine column rules or accepted short noise as one.
    height_reference = page_height if page_height is not None else page_width

    # Check for vertical lines that indicate column splits (e.g., Raleighwood format)
    if lines:
        vertical_lines = [
            float(line["x0"])
            for line in lines
            if abs(line["x0"] - line["x1"]) < 1  # Vertical line (x0 ≈ x1)
            and abs(line["y1"] - line["y0"]) > height_reference * 0.5  # Long line (spans most of page height)
        ]
        
        # Sort by x position
        vertical_lines.sort()
        
        # If we found vertical lines, use them as column boundaries
        # Typically we'd expect splits to be roughly evenly spaced
        if vertical_lines:
            # Filter to keep only lines that are reasonably spaced (not noise)
            # For 2-column: one line near the middle
            # For 3-column: two lines roughly at 1/3 and 2/3
            mid = page_width / 2.0
            
            # Look for line(s) near middle for 2-column
            near_mid = [x for x in vertical_lines if abs(x - mid) < page_width * 0.1]
            if near_mid:
                return [near_mid[0]]  # Use the first (most prominent) line near middle
            
            # Look for lines at roughly 1/3 and 2/3 for 3-column
            third1 = page_width / 3.0
            third2 = 2.0 * page_width / 3.0
            near_third1 = [x for x in vertical_lines if abs(x - third1) < page_width * 0.1]
            near_third2 = [x for x in vertical_lines if abs(x - third2) < page_width * 0.1]
            if near_third1 and near_third2:
                return [near_third1[0], near_third2[0]]


    # Priority 2: Check for Event/Heat headers as column indicators
    # This is more reliable than word distribution when visual lines aren't detected
    mid = page_width / 2.0
    third1 = page_width / 3.0
    third2 = 2.0 * page_width / 3.0
    
    header_words = [
        w
        for w in words
        if w["text"].lower() in ("event", "heat", "name")
        or re.fullmatch(r"#\d+", str(w["text"]).strip())
    ]
    
    header_2col = False
    if len(header_words) >= 2:
        # Group header words by y-position (same row)
        header_rows = {}
        y_tol = 3.0
        for w in header_words:
            y_key = None
            for existing_y in header_rows.keys():
                if abs(float(w['top']) - existing_y) <= y_tol:
                    y_key = existing_y
                    break
            if y_key is None:
                y_key = float(w['top'])
            header_rows.setdefault(y_key, []).append(w)
        
        # Analyze rows to detect 2-column or 3-column layouts
        rows_with_2_headers = 0
        rows_with_3_headers = 0
        
        for row_headers in header_rows.values():
            sorted_headers = sorted(row_headers, key=lambda w: w['x0'])
            
            if len(sorted_headers) == 3:
                left, middle, right = sorted_headers[0], sorted_headers[1], sorted_headers[2]
                gap1 = middle['x0'] - left['x1']
                gap2 = right['x0'] - middle['x1']
                if gap1 > page_width * 0.1 and gap2 > page_width * 0.1:
                    rows_with_3_headers += 1
            
            elif len(sorted_headers) == 2:
                left, right = sorted_headers[0], sorted_headers[1]
                gap = right['x0'] - left['x1']
                if gap > page_width * 0.2:
                    rows_with_2_headers += 1
        
        # If we have 2+ rows with 3 headers, it's a 3-column layout
        if rows_with_3_headers >= 2:
            return [third1, third2]
        
        # Remember 2-col headers but don't return yet — word distribution may
        # still show a 3-column prelims/finals page.
        header_2col = rows_with_2_headers >= 2

    # Priority 3: Word distribution analysis
    third1 = page_width / 3.0
    third2 = 2.0 * page_width / 3.0
    band = page_width * 0.03

    # Check if words cluster into 3 columns
    by_y: dict[int, list[dict]] = {}
    for w in words:
        by_y.setdefault(round(float(w["top"]) / 3) * 3, []).append(w)

    left_only = 0
    middle_only = 0
    right_only = 0
    
    for row_words in by_y.values():
        max_x1 = max(float(w["x1"]) for w in row_words)
        min_x0 = min(float(w["x0"]) for w in row_words)
        
        # Left column: ends before first third
        if max_x1 <= third1 + band:
            left_only += 1
        # Middle column: starts after first third, ends before second third
        elif min_x0 >= third1 - band and max_x1 <= third2 + band:
            middle_only += 1
        # Right column: starts after second third
        elif min_x0 >= third2 - band:
            right_only += 1

    # Both columns must account for at least 5% of rows each for 3-column,
    # and 10% for 2-column, to allow for frequent cross-column result lines.
    total_rows = len(by_y)
    threshold_3col = max(2, 0.05 * total_rows)
    threshold_2col = max(3, 0.10 * total_rows)
    
    if left_only >= threshold_3col and middle_only >= threshold_3col and right_only >= threshold_3col:
        return [third1, third2]

    if header_2col:
        return [mid]

    # Fall back to 2-column detection
    mid = page_width / 2.0

    # Criterion 1: increased gutter tolerance to 10% of words for results PDFs.
    crossing = sum(1 for w in words if w["x0"] < mid - band and w["x1"] > mid + band)
    if crossing > max(10, 0.10 * len(words)):
        return []

    # Criterion 2: each column must have rows that stay entirely within that half.
    left_only = 0
    right_only = 0
    for row_words in by_y.values():
        max_x1 = max(float(w["x1"]) for w in row_words)
        min_x0 = min(float(w["x0"]) for w in row_words)
        if max_x1 <= mid + band:
            left_only += 1
        elif min_x0 >= mid - band:
            right_only += 1

    # Before giving up, check for event/heat headers as a strong signal of columns
    # Final fallback: use word distribution results if they passed the threshold
    if left_only >= threshold_2col and right_only >= threshold_2col:
        return [mid]
    
    return []

def extract_page_lines(page: Any, forced_splits: list[float] | None = None) -> list[str]:
    """Extract lines in human reading order, handling multi-column layouts.

    For multi-column layouts, processes each column separately top-to-bottom,
    then concatenates left-to-right. This keeps event headers with their results.

    Args:
        page: A pdfplumber page object.
        forced_splits: If provided, use these column boundaries instead of auto-detecting.
            This ensures consistent multi-column treatment across all pages of the same PDF.
    """
    try:
        words = page.extract_words(use_text_flow=False)
    except Exception:
        words = []
    if not words:
        return [
            _clean_cid_ligatures(line)
            for line in (page.extract_text() or "").split("\n")
        ]

    if forced_splits is not None:
        splits = forced_splits
    else:
        splits = detect_column_split(words, float(page.width), lines=page.lines, page_height=float(page.height))
    if not splits:
        return group_words_into_lines(words)

    # Split words into columns
    columns: list[list[dict]] = []
    
    if len(splits) == 1:
        # 2-column layout
        mid = splits[0]
        left = [w for w in words if (w["x0"] + w["x1"]) / 2.0 < mid]
        right = [w for w in words if (w["x0"] + w["x1"]) / 2.0 >= mid]
        columns = [left, right]
    elif len(splits) == 2:
        # 3-column layout
        third1, third2 = splits
        left = [w for w in words if (w["x0"] + w["x1"]) / 2.0 < third1]
        middle = [w for w in words if third1 <= (w["x0"] + w["x1"]) / 2.0 < third2]
        right = [w for w in words if (w["x0"] + w["x1"]) / 2.0 >= third2]
        columns = [left, middle, right]
    
    # Process each column separately to maintain event context
    result = []
    for col_words in columns:
        result.extend(group_words_into_lines(col_words))
    
    return result


def parse_meet_pdf_bytes(
    content: bytes, default_course: str = "SCY", team: str | None = None
) -> dict[str, Any]:
    all_text: list[str] = []
    header_lines: list[str] = []
    has_points_column = False

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        # Detect column layout once from the first data page (usually page 1 or 2),
        # then apply it consistently to ALL pages.  Per-page detection can fail on
        # pages that happen to have long cross-column header lines or sparse content.
        pdf_splits: list[float] | None = None
        page_width: float | None = None
        found_hytek_header = False

        for page_index, page in enumerate(pdf.pages):
            # Some championship programs (CCS regionals, TYR nationals) put a
            # non-Hy-Tek cover/title page first, so the real "HY-TEK's MEET
            # MANAGER" banner — and the meet name/date next to it — doesn't
            # show up until page 2+. Keep scanning a bounded window of early
            # pages until that banner is found; fall back to page 0 (the
            # normal case) if it never turns up.
            if not found_hytek_header and page_index < 6:
                candidate_lines = [
                    _clean_cid_ligatures(line)
                    for line in (page.extract_text() or "").split("\n")
                ]
                if page_index == 0:
                    header_lines = candidate_lines
                    page_width = float(page.width)
                if _HYTEK_BANNER.search("\n".join(candidate_lines)):
                    header_lines = candidate_lines
                    found_hytek_header = True

            # Check if this PDF has a "Points" column (indicates results PDF format)
            page_text = page.extract_text() or ""
            if "Points" in page_text and ("Finals Time" in page_text or "Seed Time" in page_text):
                has_points_column = True

            # Prefer the richest column layout found on any page (3-col over 2-col).
            # Combined prelim/finals PDFs often fail detection on early relay pages.
            if page_width is not None and (pdf_splits is None or len(pdf_splits) < 2):
                try:
                    words = page.extract_words(use_text_flow=False)
                    if words:
                        candidate = detect_column_split(
                            words, page_width, lines=page.lines, page_height=float(page.height)
                        )
                        if candidate and (
                            pdf_splits is None or len(candidate) > len(pdf_splits)
                        ):
                            pdf_splits = candidate
                except Exception:
                    pass

        # Second pass: extract lines using the globally-detected split points.
        for page in pdf.pages:
            all_text.extend(extract_page_lines(page, forced_splits=pdf_splits))

    # Store this flag in a context variable for use in extract_times_from_line
    _pdf_has_points_column.set(has_points_column)

    joined_text = "\n".join(all_text)
    header_blob = "\n".join(header_lines) if header_lines else joined_text
    detected = detect_hytek_doc_type(header_blob)
    if detected == "unknown":
        detected = detect_hytek_doc_type(joined_text)

    course = detect_course(joined_text, default_course)
    meet_name, meet_date = parse_meet_header(header_lines or all_text)
    results = filter_results_by_team(parse_text_lines(all_text, course), team)
    relay_results = filter_results_by_team(parse_relay_results(all_text, course), team)

    return {
        "course": course,
        "meet_name": meet_name,
        "meet_date": meet_date,
        "detectedSheetType": detected,
        "results": dedupe_results(results),
        "relay_results": relay_results,
    }
