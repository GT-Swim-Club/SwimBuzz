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

RELAY_LEG = re.compile(
    r"(\d)\)\s*"
    r"([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
    r"(?:\s+(\d+))?",
)

# Relay team result line: place, team code, optional A/B/C letter, times.
# e.g. "1 GTSC-GA A 1:52.14 50" — no swimmer name on this row (unlike individual results).
RELAY_TEAM_RESULT = re.compile(
    r"^(\d+)\s+"
    r"([A-Z0-9]{2,}(?:-[A-Z]{2})?)\s+"
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


def extract_times_from_line(line: str) -> list[str]:
    tokens = re.findall(r"[xX]?\d{1,2}:\d{2}\.\d{2}|[xX]?\d{2,3}\.\d{2}", line, re.I)
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
    when all three are present."""
    cleaned = re.sub(r"\([^)]*\)", " ", line)
    times = extract_times_from_line(cleaned)
    if not times:
        return []
    if len(times) >= 3:
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
    """True if a club/team code matches the requested team (tolerates region suffixes)."""
    club_norm = club.strip().lower()
    if not team_norm:
        return True
    if not club_norm:
        return False
    if club_norm == team_norm:
        return True
    return club_norm.split("-")[0] == team_norm.split("-")[0]


def parse_team_from_line(line: str) -> str | None:
    """Extract team/club code from a Hy-Tek-style result line."""
    match = re.search(
        r"(?:[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
        r"(?:\s+\d{1,3})?"
        r"\s+([A-Z0-9]{2,10}(?:-[A-Z]{2})?)"
        r"\s+(?:\(|[\d:xX])",
        line,
    )
    if match:
        return match.group(1).upper()
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

        place = parse_place_from_line(stripped)

        name = parse_name_from_line(stripped)
        if not name:
            continue

        team = parse_team_from_line(stripped)

        scratch = SCRATCH_MARKER.search(stripped)
        if scratch:
            results.append(
                {
                    "name": name,
                    "event": current_event,
                    "time": scratch.group(0).upper(),
                    "course": course,
                    "tags": "",
                    "place": place,
                    "team": team,
                }
            )
            continue

        rounds = pick_round_times(stripped)
        if not rounds:
            continue

        seed_time = pick_seed_time(stripped)
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

    return results


def _is_split_line(line: str) -> bool:
    """A relay splits line is only split times — digits, colons, dots, spaces."""
    if re.search(r"[A-Za-z)]", line):
        return False
    return len(extract_times_from_line(line)) >= 2


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
                "relayLetter": block.get("relayLetter"),
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
                "relayLetter": letter.upper() if letter else None,
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


def parse_meet_pdf_bytes(
    content: bytes, default_course: str = "SCY", team: str | None = None
) -> dict[str, Any]:
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
    results = filter_results_by_team(parse_text_lines(all_text, course), team)
    relay_results = filter_results_by_team(parse_relay_results(all_text, course), team)

    return {
        "course": course,
        "meet_name": meet_name,
        "meet_date": meet_date,
        "results": dedupe_results(results),
        "relay_results": relay_results,
    }
