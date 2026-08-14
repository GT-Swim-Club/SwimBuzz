"""Parse Hy-Tek psych sheets and meet program / heat sheets."""

from __future__ import annotations

import io
import re
from typing import Any

import pdfplumber

from pdf_parse import (
    club_matches,
    detect_column_split,
    detect_course,
    detect_hytek_doc_type,
    extract_page_lines,
    group_words_into_lines,
    normalize_event,
    parse_meet_header,
)

DEFAULT_TEAM_CODE = "GTSC"


class _SheetTeam:
    """Active team filter for the current sheet parse."""

    def __init__(self, code: str) -> None:
        self.code = code

    @classmethod
    def parse(cls, team: str | None) -> "_SheetTeam":
        raw = (team or DEFAULT_TEAM_CODE).strip().upper()
        return cls(raw or DEFAULT_TEAM_CODE)

    @property
    def base(self) -> str:
        return self.code.split("-")[0]

    def matches(self, team: str) -> bool:
        return club_matches(team.strip(), self.code.lower())

    def _team_name_pattern(self) -> str:
        """Return a regex fragment matching any recognised form of the team name.

        Covers:
          * Short code only — e.g. ``GTSC``
          * Code with region suffix — e.g. ``GTSC-GA``
          * Full club name with optional region — e.g. ``Georgia Tech Swim Club-GA``
          * Partial name prefixes that ``club_matches`` considers equivalent, e.g.
            ``Georgia Tech`` (first two words of the expansion) or
            ``Georgia Tech Swim`` (three words).

        The longest alternates are listed first so the regex engine greedily
        matches the most complete team name when multiple alternates could fit.
        """
        base = re.escape(self.base)
        # Short-code variants: GTSC or GTSC-GA
        code_pat = rf"{base}(?:-[A-Z]{{2}})?"

        # Build full-name alternates by expanding each letter of the base code to
        # "any word starting with that letter" (\S+), then producing one alternate
        # per prefix length (longest first, minimum two words so we don't match
        # single-letter tokens):
        #   GTSC → Georgia Tech Swim Club, Georgia Tech Swim, Georgia Tech
        word_parts: list[str] = []
        for ch in self.base:
            word_parts.append(rf"[{ch.upper()}{ch.lower()}]\S*")

        full_name_alts: list[str] = []
        for length in range(len(word_parts), 1, -1):
            full_name_alts.append(r"\s+".join(word_parts[:length]) + r"(?:\s+\S+)*")

        if full_name_alts:
            # Allow an optional region suffix like -GA after the full name.
            full_name_pat = (
                "(?:" + "|".join(full_name_alts) + r")(?:-[A-Z]{2})?"
            )
            return f"(?:{code_pat}|{full_name_pat})"

        return code_pat

    def _relay_team_pattern(self) -> str:
        """Return a regex fragment for the team field in a relay entry line.

        Unlike *_team_name_pattern*, this variant must NOT greedily consume the
        relay letter (A/B/C/D) or the seed time that follow the team name.  It
        stops at the last word that doesn't look like a relay letter or a time.

        Strategy: build explicit alternates from longest to shortest, each
        terminated by a lookahead that asserts the next token is a relay letter
        or a time value.
        """
        base = re.escape(self.base)
        code_pat = rf"{base}(?:-[A-Z]{{2}})?"

        word_parts: list[str] = []
        for ch in self.base:
            word_parts.append(rf"[{ch.upper()}{ch.lower()}]\S*")

        # Lookahead: next non-space must be a relay letter followed by space,
        # or a time / NT token.
        time_look = (
            r"(?=\s*(?:[ABCD]\s+|NT\b|NQT\b|DFS\b|SCR\b"
            r"|\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2}))"
        )

        full_name_alts: list[str] = []
        for length in range(len(word_parts), 1, -1):
            core = r"\s+".join(word_parts[:length])
            # Allow extra words only when they don't look like relay letters / times
            extra = r"(?:\s+(?![ABCD]\s+|NT\b|NQT\b|DFS\b|SCR\b|\d)\S+)*"
            region = r"(?:-[A-Z]{2})?"
            full_name_alts.append(core + extra + region + time_look)

        if full_name_alts:
            full_name_pat = "(?:" + "|".join(full_name_alts) + ")"
            return f"(?:{code_pat}|{full_name_pat})"

        return code_pat

    def individual_re(self) -> re.Pattern[str]:
        team_pat = self._team_name_pattern()
        time_pat = r"NT|NQT|DFS|SCR|\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2}"
        # Match individual entries with optional age before team (with or without space).
        # Formats:
        #   "1 Carlton, Delaney 23 Georgia Tech 1:56.69"  (age with space)
        #   "7 Elvambuena, Ella 20GTSC-GA 1:14.69"        (age concatenated)
        return re.compile(
            rf"(\d+)\s+(.+?)\s+(?:\d{{1,2}}\s*)?{team_pat}\s+"
            rf"({time_pat})",
            re.I,
        )

    def relay_re(self) -> re.Pattern[str]:
        team_pat = self._relay_team_pattern()
        time_pat = r"NT|NQT|DFS|SCR|\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2}"
        return re.compile(
            rf"(\d+)\s+"
            rf"({team_pat})\s*"
            rf"([ABCD])?\s*"
            rf"({time_pat})",
            re.I,
        )


_sheet_team = _SheetTeam.parse(None)


def _use_sheet_team(team: str | None) -> _SheetTeam:
    global _sheet_team
    _sheet_team = _SheetTeam.parse(team)
    return _sheet_team

SHEET_PSYCH = re.compile(r"Psych\s+Sheet", re.I)
SHEET_HEAT = re.compile(r"Meet\s+Program", re.I)
SHEET_ENTRIES = re.compile(
    r"Team Entries|Individual Meet Entries|Entry Report(?:\s+by\s+Club)?|"
    r"Entries Report|Meet Entries Report",
    re.I,
)
_SHEET_GENDER = r"(?:Women|Men|Mixed|Co-?ed|Girls|Boys)"
USMS_MULTI_COL = re.compile(
    rf"#\d+\s+{_SHEET_GENDER}\s+(?:\d+x\d+|\d+)", re.I
)

EVENT_STING = re.compile(
    rf"^Event\s+(\d+)\s+({_SHEET_GENDER}|Girls|Boys)\s+(\d+)\s+Yard\s+(.+)$",
    re.I,
)
EVENT_STING_WRAP = re.compile(
    rf"Event\s+(\d+)\s+\.\.\.\s*\(({_SHEET_GENDER}|Girls|Boys)\s+(\d+)\s+Yard\s+([^)]+)\)",
    re.I,
)

EVENT_USMS_COMPLETE = re.compile(
    rf"^#(\d+)\s+({_SHEET_GENDER})\s+((?:\d+x\d+|\d+)\s+Yard\s+.+)$",
    re.I,
)
EVENT_USMS_WRAP = re.compile(
    rf"#(\d+)\s+\.\.\.\s*\(({_SHEET_GENDER})\s+((?:\d+x\d+|\d+)\s+Yard\s+[^)]+)\)",
    re.I,
)
EVENT_USMS_PARTIAL = re.compile(
    rf"^#(\d+)\s+({_SHEET_GENDER})\s+((?:\d+x\d+|\d+)\s+Yard)$",
    re.I,
)
STROKE_CONT = re.compile(
    r"^(Backstroke|Breaststroke|Freestyle|Butterfly|Individual Medley|"
    r"Back|Breast|Free|Fly|IM)$",
    re.I,
)

HEAT_WITH_EVENT = re.compile(
    rf"Heat\s+(\d+)\s+\(#(\d+)\s+({_SHEET_GENDER})\s+((?:\d+x\d+|\d+)\s+Yard\s+[^)]+)\)",
    re.I,
)
HEAT_HEADER = re.compile(
    r"Heat\s+(\d+)\s+of\s+(\d+)\s+(Prelims|Finals|Timed\s+Finals)"
    r"(?:\s+Starts\s+at\s+([\d:]+\s*[AP]M))?",
    re.I,
)
# A/B/C finals programs: "Heat 1 C - Final", "Heat 3 A - Final"
HEAT_ABC_FINAL = re.compile(
    r"Heat\s+(\d+)\s+([ABC])\s*-\s*Finals?",
    re.I,
)
MEET_PROGRAM_SESSION = re.compile(
    r"Meet\s+Program\s*-\s*(.+)$",
    re.I,
)
ALTERNATES_HEADER = re.compile(r"^Alternates\b", re.I)

COLUMN_HEADER = re.compile(
    r"^(?:Lane\s+)?(?:Name|Team)\s+.*(?:Seed|Relay|Prelims)",
    re.I,
)

_SEED_TIME_TOKEN = r"(NT|NQT|DFS|SCR|DNS|NS|DQ|\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2})"

INDIVIDUAL_ROW = re.compile(
    r"^(\d+)\s+"
    r"([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)\s+"
    r"(\d+)\s+"
    r"(\S+)\s+"
    rf"({_SEED_TIME_TOKEN})",
    re.I,
)

# Any team — used to rank finals heat-sheet seeds across the whole event.
INDIVIDUAL_SEED_ANY = re.compile(
    r"(\d+)\s+"
    r"(?:[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)\s+"
    r"\d+\s+"
    r"\S+\s+"
    rf"({_SEED_TIME_TOKEN})",
    re.I,
)

RELAY_SEED_ANY = re.compile(
    rf"(\d+)\s+(.+?)\s+([A-D])\s+({_SEED_TIME_TOKEN})\b",
    re.I,
)

TEAM_SUMMARY = re.compile(r"^\d[\d,]*\s*/\s*\d+\s+", re.I)

RELAY_LEG = re.compile(
    r"(\d)\)\s*"
    r"([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*,\s*[A-Z][A-Za-z'\-]+)"
    r"(?:\s+(\d+))?",
)

SKIP_LINE = re.compile(
    r"^(HY-TEK|Georgia Tech|Classic|Timed Finals|Psych Sheet|Meet Program|Page \d|USMS)",
    re.I,
)


# PDF CID glyphs seen in Hy-Tek exports (often missing base letters).
_CID_LIGATURES = {
    "976": "f",
}

_VALID_RELAY_LETTERS = frozenset({"A", "B", "C", "D"})


def normalize_relay_letter(letter: str | None) -> str | None:
    """Return A–D relay letter, or None when missing / not a team letter."""
    token = (letter or "").strip().upper()
    if token in _VALID_RELAY_LETTERS:
        return token
    return None


def _clean_line(line: str) -> str:
    line = re.sub(r"Butter\(cid:\d+\)ly", "Fly", line, flags=re.I)

    def _replace_cid(match: re.Match[str]) -> str:
        return _CID_LIGATURES.get(match.group(1), "")

    line = re.sub(r"\(cid:(\d+)\)", _replace_cid, line)
    line = line.replace("Butterfly", "Fly").replace("Butter fly", "Fly")
    line = line.replace("Backstroke", "Back").replace("Breaststroke", "Breast")
    line = line.replace("Freestyle", "Free").replace("Individual Medley", "IM")
    # Strip trailing blank-fill columns that some Hy-Tek formats append for
    # hand-written results (e.g. "1:55.24 _________________ _______").
    line = re.sub(r"\s*_{4,}[\s_]*$", "", line)
    # Strip non-conforming "X" prefix from seed times (e.g. X2:03.00, XNT).
    line = re.sub(r"\bX(NT|NQT|\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2})\b", r"\1", line, flags=re.I)
    return re.sub(r"\s+", " ", line).strip()


def _gender_code(label: str) -> str:
    lower = label.lower().replace("-", "")
    if lower in {"girls", "women", "female"}:
        return "F"
    if lower in {"boys", "men", "male"}:
        return "M"
    if lower in {"mixed", "coed"}:
        return "X"
    return "M"


def _is_team(team: str) -> bool:
    return _sheet_team.matches(team)


def _event_from_stroke(distance: str, stroke_raw: str) -> str:
    lower = stroke_raw.lower().strip()
    if "relay" in lower:
        mult = re.search(r"(\d+)x(\d+)", lower.replace(" ", ""))
        if "medley" in lower:
            if mult:
                if "mixed" in lower:
                    return f"{mult.group(1)}x{mult.group(2)} Mixed Medley Relay"
                return f"{mult.group(1)}x{mult.group(2)} Medley Relay"
            return f"{distance} Medley Relay"
        if "mixed" in lower and mult:
            return f"{mult.group(1)}x{mult.group(2)} Mixed Free Relay"
        if mult:
            return f"{mult.group(1)}x{mult.group(2)} Free Relay"
        if "freestyle" in lower or "free" in lower:
            return f"{distance} Free Relay"
        return f"{distance} Relay"
    normalized = normalize_event(distance, stroke_raw)
    return normalized or f"{distance} {stroke_raw}"


def _build_event(event_num: str, gender_label: str, stroke_raw: str) -> dict[str, Any] | None:
    dist_m = re.match(r"((?:\d+x\d+|\d+))\s+Yard\s+(.+)", stroke_raw.strip(), re.I)
    if not dist_m:
        return None
    distance, stroke_part = dist_m.groups()
    is_relay = "relay" in stroke_part.lower()
    return {
        "eventNumber": int(event_num),
        "gender": _gender_code(gender_label),
        "genderLabel": gender_label,
        "event": _event_from_stroke(distance, stroke_part),
        "eventLabel": stroke_raw.strip(),
        "isRelay": is_relay,
    }


def _parse_usms_event_line(line: str) -> dict[str, Any] | None:
    match = EVENT_USMS_COMPLETE.match(line)
    if match:
        return _build_event(*match.groups())

    match = EVENT_USMS_WRAP.search(line)
    if match:
        return _build_event(*match.groups())

    return None


def _clean_psych_name(raw: str) -> str | None:
    raw = re.sub(r"\(cid:976\)", "f", raw)
    raw = re.sub(r"\(cid:\d+\)", "", raw).strip()
    match = re.match(
        r"([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*),\s*(.+)",
        raw.strip(),
    )
    if not match:
        return None
    last = match.group(1)
    first_blob = match.group(2)
    first_clean = re.sub(r"\d+", "", first_blob)
    first_clean = re.sub(r"[^A-Za-z'\-]", "", first_clean)
    if len(first_clean) < 2:
        return None
    return f"{last}, {first_clean}"


def _parse_event_header(line: str) -> dict[str, Any] | None:
    match = EVENT_STING.match(line)
    if not match:
        match = EVENT_STING_WRAP.search(line)
    if match:
        event_num, gender_label, distance, stroke_raw = match.groups()
        is_relay = "relay" in stroke_raw.lower()
        return {
            "eventNumber": int(event_num),
            "gender": _gender_code(gender_label),
            "genderLabel": gender_label,
            "event": _event_from_stroke(distance, stroke_raw),
            "eventLabel": line,
            "isRelay": is_relay,
        }
    return _parse_usms_event_line(line)


def _session_round_from_line(line: str) -> str | None:
    """Extract prelims/finals from a 'Meet Program - …' session header."""
    match = MEET_PROGRAM_SESSION.search(line)
    if not match:
        return None
    label = match.group(1).lower()
    if "timed" in label and "final" in label:
        return "timed_finals"
    if "final" in label:
        return "finals"
    if "prelim" in label:
        return "prelims"
    return None


def _parse_heat_with_event(
    line: str,
    *,
    default_round: str = "prelims",
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    match = HEAT_WITH_EVENT.search(line)
    if not match:
        return None
    heat_num, event_num, gender_label, stroke_raw = match.groups()
    event = _build_event(event_num, gender_label, stroke_raw)
    if not event:
        return None
    heat_total_m = re.search(
        r"Heat\s+(\d+)\s+of\s+(\d+)\s+(Prelims|Finals|Timed\s+Finals)",
        line,
        re.I,
    )
    heat: dict[str, Any] = {
        "heat": int(heat_num),
        "heatTotal": None,
        "round": default_round,
        "startTime": None,
    }
    if heat_total_m:
        heat["heatTotal"] = int(heat_total_m.group(2))
        heat["round"] = heat_total_m.group(3).lower().replace(" ", "_")
    elif HEAT_ABC_FINAL.search(line):
        heat["round"] = "finals"
    return event, heat


def _split_program_line(line: str) -> list[str]:
    stripped = line.strip()
    if not stripped:
        return []

    matches = list(_sheet_team.individual_re().finditer(stripped))
    if len(matches) > 1:
        parts: list[str] = []
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(stripped)
            parts.append(stripped[start:end].strip())
        return [p for p in parts if p]

    matches = list(INDIVIDUAL_ROW.finditer(stripped))
    if len(matches) > 1:
        parts = []
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(stripped)
            parts.append(stripped[start:end].strip())
        return [p for p in parts if p]

    return [stripped]


def _extract_name(name_blob: str) -> tuple[str | None, int | None]:
    name = _clean_psych_name(name_blob)
    if not name:
        return None, None
    age_m = re.search(r",\s*[A-Za-z'\-]+\s+(\d{2})\s", name_blob)
    age = int(age_m.group(1)) if age_m else None
    return name, age


def _build_individual_entry(
    rank_or_lane: str,
    name: str,
    age: int | None,
    team: str,
    time_token: str,
    *,
    sheet_type: str,
    event: dict[str, Any],
    heat: dict[str, Any] | None,
    alternate: bool = False,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "entryType": "individual",
        "name": name.strip(),
        "team": team.upper(),
        "eventNumber": event["eventNumber"],
        "event": event["event"],
        "gender": event["gender"],
        "isRelay": False,
    }
    if age is not None:
        entry["age"] = age

    if time_token.upper() in {"NT", "NQT", "NS", "DQ", "DFS", "DNF", "SCR", "DNS"}:
        entry["timeStatus"] = time_token.upper()
    else:
        entry["seedTime"] = time_token

    if alternate:
        entry["seedRank"] = int(rank_or_lane)
        entry["alternate"] = True
        entry["round"] = (heat or {}).get("round") or "finals"
    elif sheet_type == "psych" or not heat:
        # Meet programs list some distance events by seed rank (no heat/lane).
        entry["seedRank"] = int(rank_or_lane)
    else:
        entry["lane"] = int(rank_or_lane)
        # Copy heat placement, skipping null heat numbers from alternate context.
        for key, value in heat.items():
            if value is not None:
                entry[key] = value

    return entry


def _parse_individual(
    line: str,
    *,
    sheet_type: str,
    event: dict[str, Any],
    heat: dict[str, Any] | None,
    alternate: bool = False,
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []

    for match in _sheet_team.individual_re().finditer(line):
        rank, name_raw, time_token = match.groups()
        name, age = _extract_name(name_raw)
        if not name:
            continue
        entries.append(
            _build_individual_entry(
                rank, name, age, _sheet_team.code, time_token,
                sheet_type=sheet_type, event=event, heat=heat,
                alternate=alternate,
            )
        )

    if entries:
        return entries

    match = INDIVIDUAL_ROW.match(line)
    if match:
        rank_or_lane, name, age_s, team, time_token = match.groups()
        if _is_team(team):
            entries.append(
                _build_individual_entry(
                    rank_or_lane, name, int(age_s), team, time_token,
                    sheet_type=sheet_type, event=event, heat=heat,
                    alternate=alternate,
                )
            )
    return entries


def _parse_relay_team(
    line: str,
    *,
    sheet_type: str,
    event: dict[str, Any],
    heat: dict[str, Any] | None,
    alternate: bool = False,
) -> dict[str, Any] | None:
    match = _sheet_team.relay_re().match(line)
    if not match:
        return None

    rank_or_lane, team, letter, time_token = match.groups()
    entry: dict[str, Any] = {
        "entryType": "relay_team",
        "team": team.upper(),
        "relayLetter": normalize_relay_letter(letter),
        "eventNumber": event["eventNumber"],
        "event": event["event"],
        "gender": event["gender"],
        "isRelay": True,
        "relaySwimmers": [],
    }

    if time_token.upper() in {"NT", "NQT", "NS", "DQ", "DFS", "DNF", "SCR", "DNS"}:
        entry["timeStatus"] = time_token.upper()
    else:
        entry["seedTime"] = time_token

    # Multi-column psych sheets often bleed the next team's NQT onto the same line
    # (e.g. "1 GTSC 3:33.69 NQT 7 ASU 3:05.98 NQT"). Only scan for a trailing
    # status when the primary token was not already a seed time.
    if not entry.get("seedTime"):
        status_m = re.search(
            r"\b(NT|NQT|NS|DQ|DFS|DNF|SCR|DNS)\b",
            line[match.end() :],
            re.I,
        )
        if status_m:
            entry["timeStatus"] = status_m.group(1).upper()

    if alternate:
        entry["seedRank"] = int(rank_or_lane)
        entry["alternate"] = True
        entry["round"] = (heat or {}).get("round") or "finals"
    elif sheet_type == "psych" or not heat:
        entry["seedRank"] = int(rank_or_lane)
    else:
        entry["lane"] = int(rank_or_lane)
        for key, value in heat.items():
            if value is not None:
                entry[key] = value

    return entry


def _parse_relay_leg(line: str, offset: int = 0) -> list[dict[str, Any]]:
    legs: list[dict[str, Any]] = []
    
    # Try explicit leg format (1), 2)...)
    for leg_num, name, age in RELAY_LEG.findall(line):
        legs.append(
            {
                "leg": int(leg_num),
                "name": name.strip(),
                "age": int(age) if age else None,
            }
        )
    
    # Try result format (Name, Name Age)
    if not legs:
        matches = re.findall(r"([A-Za-z'\-]+,\s*[A-Za-z'\-]+)(?:\s+(\d+))?", line)
        for i, (name, age) in enumerate(matches):
            legs.append({
                "leg": offset + i + 1,
                "name": name.strip(),
                "age": int(age) if age else None,
            })
            
    return legs


def _detect_sheet_type(text: str) -> str:
    detected = detect_hytek_doc_type(text)
    if detected in {"psych", "heat", "entries", "results", "packet"}:
        return detected
    return "unknown"


def _sheet_meet_name(text: str) -> str | None:
    meet_name, _ = parse_meet_header(text.split("\n"))
    return meet_name


SWIMMER_HEADER = re.compile(
    r"^(\d+)\s+"
    r"([A-Za-z'\-ϐ]+(?:\s+[A-Za-z'\-ϐ]+)*,\s*[A-Za-z'\-ϐ]+(?:\s+[A-Za-z'\-ϐ]+)?)"
    r"\s+-\s+(Female|Male)\s+-",
    re.I,
)
ENTRY_CELL = re.compile(
    r"#\s*(\d+)\s+(Women|Men|Mixed|Female|Male)\s+"
    r"(.+?)\s+"
    r"(NT|NQT|DFS|SCR|DNS|DQ|\d{1,2}:\d{2}\.\d{2}Y?|\d{2,3}\.\d{2}Y?)",
    re.I,
)
ENTRY_SKIP = re.compile(
    r"^(HY-TEK|USMS|Total Individual|Georgia Tech Swim Club Total|"
    r"Page \d|All Events|Team Entries|Entries Report|Licensed To|Individual Meet|"
    r"Sanction:|Female IE|Male IE|Total IE|Total Athletes|\d{4}\s+TYR|-\s|"
    r"\d{1,2}-\d{1,2}-\d{2,4}\s+GTSC|FEMALE|MALE|"
    r"National Championship|CCS National|Liaison|MEET MANAGER)",
    re.I,
)
ENTRY_SKIP_STANDALONE = re.compile(
    r"^(\d+\s*/\s*\d+|/\s*\d+|\d+|Ind/Rel:.*)$",
    re.I,
)


def _entry_skip_line(line: str) -> bool:
    if ENTRY_SKIP.search(line):
        return True
    stripped = line.strip()
    if ENTRY_SKIP_STANDALONE.match(stripped):
        return True
    if re.match(rf"^{re.escape(_sheet_team.base)}\s+[A-Za-z]", stripped, re.I):
        return True
    # Bare team-code rows only — not entry lines that start with the team tag.
    if re.match(rf"^{re.escape(_sheet_team.base)}(?:-[A-Z]{{2}})?\s*$", stripped, re.I):
        return True
    return False


def _swimmer_with_team_pattern() -> re.Pattern[str]:
    base = re.escape(_sheet_team.base)
    return re.compile(
        rf"([A-Z][A-Za-z'\-\.]+(?:\s+[A-Z][A-Za-z'\-\.]+)+)\s+{base}(?:-[A-Z]{{2}})?\b",
        re.I,
    )


def _standalone_swimmer_name(line: str) -> str | None:
    stripped = line.strip()
    if not stripped or "#" in stripped:
        return None
    if _swimmer_with_team_pattern().search(stripped):
        return None
    if ENTRY_CELL.search(stripped):
        return None
    if re.search(r"\b(Female|Male|Women|Men|Mixed)\b", stripped, re.I):
        return None
    match = re.match(r"^([A-Z][A-Za-z'\-\.]+(?:\s+[A-Z][A-Za-z'\-\.]+)+)$", stripped)
    return match.group(1).strip() if match else None


def _entry_cell_from_groups(
    event_num: str, gender_label: str, event_raw: str, time_token: str
) -> dict[str, Any]:
    event, is_relay, relay_leg, round_tag = _normalize_entry_event(event_raw)
    row: dict[str, Any] = {
        "eventNumber": int(event_num),
        "gender": _gender_code(gender_label),
        "event": event,
        "isRelay": is_relay,
        "relayLeg": relay_leg,
        "round": round_tag,
    }
    token = time_token.strip().rstrip("Yy")
    if token.upper() in {"NT", "NQT", "NS", "DQ", "DFS", "DNF", "SCR", "DNS"}:
        row["timeStatus"] = token.upper()
    else:
        row["seedTime"] = token
    return row


def _parse_entry_report_row(
    line: str, current_swimmer: str | None
) -> tuple[str | None, list[tuple[str, dict[str, Any]]]]:
    """Parse one Hy-Tek individual entry report row (supports 2-column layout)."""
    legacy = SWIMMER_HEADER.match(line)
    if legacy:
        return legacy.group(2).strip(), []

    standalone = _standalone_swimmer_name(line)
    if standalone:
        return standalone, []

    swimmers = [
        (match.start(), match.group(1).strip())
        for match in _swimmer_with_team_pattern().finditer(line)
    ]
    cells = [
        (match.start(), _entry_cell_from_groups(*match.groups()))
        for match in ENTRY_CELL.finditer(line)
    ]

    if not cells and not swimmers:
        return current_swimmer, []

    active = swimmers[0][1] if swimmers and swimmers[0][0] == 0 else current_swimmer
    paired: list[tuple[str, dict[str, Any]]] = []
    for pos, cell in cells:
        prior = [name for start, name in swimmers if start < pos]
        swimmer = prior[-1] if prior else active
        if not swimmer:
            continue
        paired.append((swimmer, cell))

    new_current = swimmers[-1][1] if swimmers else current_swimmer
    return new_current, paired


ENTRY_NAME_HEADER = re.compile(r"^Name(?:\s+Name)?$", re.I)


def _match_relay_roster_header(line: str) -> re.Match[str] | None:
    match = re.match(r"^(\d+)\s+([^#,;]+?)(?:\s+#(\d+))?\s*$", line.strip())
    if not match:
        return None
    label = match.group(2).strip()
    if "," in label or re.search(r"\b(Women|Men|Mixed)\b", label, re.I):
        return None
    return match


def _normalize_entry_event(raw: str) -> tuple[str, bool, int | None, str | None]:
    """Return event name, is_relay, relay leg, and prelim/final round tag."""
    raw = raw.strip()

    leg_m = re.search(r"\((\d)\)\s*$", raw)
    relay_leg = int(leg_m.group(1)) if leg_m else None
    if leg_m:
        raw = raw[: leg_m.start()].strip()

    round_tag: str | None = None
    if re.search(r"\bPrelims?\b", raw, re.I):
        round_tag = "P"
        raw = re.sub(r"\s*Prelims?\s*", " ", raw, flags=re.I).strip()
    elif re.search(r"\bFinals?\b", raw, re.I):
        round_tag = "F"
        raw = re.sub(r"\s*Finals?\s*", " ", raw, flags=re.I).strip()

    raw = (
        raw.replace("Freestyle", "Free")
        .replace("Backstroke", "Back")
        .replace("Breaststroke", "Breast")
        .replace("Butterfly", "Fly")
        .replace("Individual Medley", "IM")
    )

    is_relay = bool(re.search(r"\d+x\d+", raw, re.I)) or "relay" in raw.lower()
    if is_relay:
        mult = re.search(r"(\d+)x(\d+)", raw.replace(" ", ""), re.I)
        if mult and "medley" in raw.lower():
            event = f"{mult.group(1)}x{mult.group(2)} Medley Relay"
        elif mult and "mixed" in raw.lower():
            event = f"{mult.group(1)}x{mult.group(2)} Mixed Free Relay"
        elif mult:
            event = f"{mult.group(1)}x{mult.group(2)} Free Relay"
        else:
            event = raw
    else:
        dist_m = re.match(r"(\d+)\s+(.+)", raw)
        if dist_m:
            event = normalize_event(dist_m.group(1), dist_m.group(2)) or raw
        else:
            event = raw

    return event, is_relay, relay_leg, round_tag


def _parse_entry_cells(line: str) -> list[dict[str, Any]]:
    return [
        _entry_cell_from_groups(*match.groups()) for match in ENTRY_CELL.finditer(line)
    ]


def _parse_relay_roster_names(line: str) -> list[str]:
    if not line or _match_relay_roster_header(line) or _entry_skip_line(line):
        return []
    if ENTRY_CELL.search(line) or SWIMMER_HEADER.match(line):
        return []
    if re.match(r"^\d+$", line.strip()):
        return []
    if not re.search(r",\s*[A-Za-z]", line):
        return []
    names: list[str] = []
    for part in re.split(r";", line):
        raw_part = part.strip()
        if not raw_part:
            continue
        cleaned = _clean_psych_name(raw_part.rstrip(",")) or raw_part.rstrip(",").strip()
        if not cleaned:
            continue
        if re.search(r",\s*[A-Za-z]", cleaned):
            names.append(cleaned)
        elif raw_part.endswith(","):
            names.append(cleaned)
    return names


def _relay_team_from_legs(
    event_number: int,
    event: str,
    gender: str,
    seed_time: str | None,
    time_status: str | None,
    relay_letter: str | None,
    legs: list[dict[str, Any]],
) -> dict[str, Any]:
    swimmers = sorted(legs, key=lambda leg: leg["leg"])
    entry: dict[str, Any] = {
        "entryType": "relay_team",
        "eventNumber": event_number,
        "event": event,
        "gender": gender,
        "isRelay": True,
        "relayLetter": normalize_relay_letter(relay_letter),
        "relaySwimmers": [
            {"leg": leg["leg"], "name": leg["name"], "age": leg.get("age")}
            for leg in swimmers
        ],
    }
    if time_status:
        entry["timeStatus"] = time_status
    elif seed_time:
        entry["seedTime"] = seed_time
    return entry


def _relay_event_key(leg: dict[str, Any]) -> tuple[Any, ...]:
    return (
        leg["eventNumber"],
        leg["event"],
        leg["gender"],
        leg.get("seedTime") or leg.get("timeStatus") or "",
    )


def _legs_for_roster_name(
    name: str, legs_by_name: dict[str, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    if name in legs_by_name:
        return legs_by_name[name]
    last = name.split(",")[0].strip().casefold()
    if not last:
        return []
    for full_name, legs in legs_by_name.items():
        if full_name.split(",")[0].strip().casefold() == last:
            return legs
    return []


def _resolved_roster_name(
    name: str, legs_by_name: dict[str, list[dict[str, Any]]]
) -> str:
    if name in legs_by_name:
        return name
    last = name.split(",")[0].strip().casefold()
    for full_name in legs_by_name:
        if full_name.split(",")[0].strip().casefold() == last:
            return full_name
    return name


def _build_relay_teams_from_rosters(
    relay_rosters: list[tuple[str | None, list[str]]],
    leg_entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    legs_by_name: dict[str, list[dict[str, Any]]] = {}
    for leg in leg_entries:
        legs_by_name.setdefault(leg["name"], []).append(leg)

    teams: list[dict[str, Any]] = []
    used_keys: set[tuple[str | None, tuple[Any, ...]]] = set()

    for relay_letter, roster in relay_rosters:
        if len(roster) < 3:
            continue

        votes: dict[tuple[Any, ...], int] = {}
        leg_lookup: dict[tuple[str, tuple[Any, ...]], dict[str, Any]] = {}
        for name in roster:
            resolved = _resolved_roster_name(name, legs_by_name)
            for leg in _legs_for_roster_name(name, legs_by_name):
                key = _relay_event_key(leg)
                votes[key] = votes.get(key, 0) + 1
                leg_lookup[(resolved, key)] = leg

        if not votes:
            continue

        best_key = max(votes, key=lambda key: votes[key])
        if votes[best_key] < 2:
            continue

        dedupe_key = (relay_letter, best_key)
        if dedupe_key in used_keys:
            continue
        used_keys.add(dedupe_key)

        event_number, event, gender, _time_token = best_key
        sample = next(
            (
                leg_lookup[(name, best_key)]
                for name in roster
                if (name, best_key) in leg_lookup
            ),
            None,
        )
        seed_time = sample.get("seedTime") if sample else None
        time_status = sample.get("timeStatus") if sample else None

        swimmers: list[dict[str, Any]] = []
        for index, name in enumerate(roster[:4]):
            resolved = _resolved_roster_name(name, legs_by_name)
            leg = leg_lookup.get((resolved, best_key))
            swimmers.append(
                {
                    "leg": leg["leg"] if leg and leg.get("leg") else index + 1,
                    "name": resolved,
                    "age": leg.get("age") if leg else None,
                }
            )

        teams.append(
            _relay_team_from_legs(
                event_number,
                event,
                gender,
                seed_time,
                time_status,
                relay_letter,
                swimmers,
            )
        )

    return teams


def _group_relay_leg_entries(
    leg_entries: list[dict[str, Any]],
    relay_rosters: list[tuple[str | None, list[str]]],
) -> list[dict[str, Any]]:
    """Build relay_team rows from roster blocks, with a fallback for complete leg sets."""
    teams = _build_relay_teams_from_rosters(relay_rosters, leg_entries)
    covered = {
        (team["eventNumber"], team["event"], team["gender"], swimmer["name"])
        for team in teams
        for swimmer in team["relaySwimmers"]
    }

    by_key: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for leg in leg_entries:
        if not leg.get("leg"):
            continue
        key = _relay_event_key(leg)
        if (leg["eventNumber"], leg["event"], leg["gender"], leg["name"]) in covered:
            continue
        by_key.setdefault(key, []).append(leg)

    for key, legs in by_key.items():
        event_number, event, gender, _time_token = key
        seed_time = legs[0].get("seedTime")
        time_status = legs[0].get("timeStatus")
        if len(legs) == 4 and {leg["leg"] for leg in legs} == {1, 2, 3, 4}:
            teams.append(
                _relay_team_from_legs(
                    event_number,
                    event,
                    gender,
                    seed_time,
                    time_status,
                    None,
                    legs,
                )
            )

    return teams


def _entry_report_uses_column_flow(pdf: Any) -> bool:
    """Hy-Tek club entry lists read left column then right; USMS club reports pair rows."""
    sample = "\n".join(page.extract_text() or "" for page in pdf.pages[: min(2, len(pdf.pages))])
    if SWIMMER_HEADER.search(sample):
        return False
    if re.search(r"Ind/Rel\s*:", sample, re.I):
        return False
    return True


def _entry_report_row_paired_lines(page: Any) -> list[str]:
    """Merge each visual row left-to-right — USMS club entry reports."""
    try:
        words = page.extract_words(use_text_flow=False)
    except Exception:
        words = []
    if not words:
        return extract_page_lines(page)

    bands: dict[int, list[dict]] = {}
    for word in words:
        band = round(float(word["top"]) / 3) * 3
        bands.setdefault(band, []).append(word)

    lines: list[str] = []
    for band in sorted(bands):
        row = sorted(bands[band], key=lambda w: w["x0"])
        text = " ".join(w["text"] for w in row).strip()
        cleaned = _clean_line(text)
        if cleaned:
            lines.append(cleaned)
    return lines


def _entry_report_page_lines(page: Any, *, column_flow: bool) -> list[tuple[str, str | None]]:
    """Return (line, column) for one entry-report page.

  Row-paired layouts merge each horizontal band left-to-right (USMS club reports).
  Column-flow layouts read the left column top-to-bottom, then the right column.
  column is ``L``, ``R``, or None.
    """
    if not column_flow:
        return [(line, None) for line in _entry_report_row_paired_lines(page)]

    try:
        words = page.extract_words(use_text_flow=False)
    except Exception:
        words = []
    if not words:
        return [(line, None) for line in extract_page_lines(page)]

    splits = detect_column_split(words, float(page.width))
    if not splits:
        return [
            (cleaned, None)
            for line in group_words_into_lines(words)
            for cleaned in [_clean_line(line)]
            if cleaned
        ]

    items: list[tuple[str, str | None]] = []
    # Add a boundary at the end to cover the last column
    boundaries = splits + [float(page.width)]
    start = 0.0
    for i, boundary in enumerate(boundaries):
        column_label = chr(ord('L') + i) if i < 2 else 'R' # Keep 'L'/'R' as expected by row-pairing logic
        column_words = [w for w in words if start <= (w["x0"] + w["x1"]) / 2.0 < boundary]
        for raw in group_words_into_lines(column_words):
            cleaned = _clean_line(raw)
            if cleaned:
                items.append((cleaned, column_label))
        start = boundary
    return items


def _entry_report_team_only_line(line: str) -> bool:
    stripped = line.strip()
    return bool(
        re.match(rf"^{re.escape(_sheet_team.base)}(?:-[A-Z]{{2}})?\s*$", stripped, re.I)
    )


def parse_entry_report(content: bytes, team: str | None = None) -> dict[str, Any]:
    """Parse Hy-Tek team entry reports (seed times by swimmer)."""
    _use_sheet_team(team)
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        pages = list(pdf.pages)
        column_flow = _entry_report_uses_column_flow(pdf)
        page_lines = [
            item
            for page in pages
            for item in _entry_report_page_lines(page, column_flow=column_flow)
        ]
        all_text = "\n".join(line for line, _ in page_lines)
        course = detect_course(all_text)
        meet_name = _sheet_meet_name(all_text)
        detected = _detect_sheet_type(all_text)

    individuals: list[dict[str, Any]] = []
    relay_legs: list[dict[str, Any]] = []
    relay_rosters: list[tuple[str | None, list[str]]] = []
    current_swimmer: str | None = None
    pending_name: str | None = None
    pending_relay_letter: str | None = None
    in_relay_section = False
    pending_name_continuation = False

    def append_individual(swimmer_name: str, cell: dict[str, Any]) -> None:
        entry: dict[str, Any] = {
            "entryType": "individual",
            "name": swimmer_name,
            "eventNumber": cell["eventNumber"],
            "event": cell["event"],
            "gender": cell["gender"],
            "isRelay": False,
        }
        if cell.get("timeStatus"):
            entry["timeStatus"] = cell["timeStatus"]
        elif cell.get("seedTime"):
            entry["seedTime"] = cell["seedTime"]
        if cell.get("round"):
            entry["round"] = cell["round"]
        individuals.append(entry)

    def append_relay_leg(swimmer_name: str, cell: dict[str, Any]) -> None:
        relay_legs.append(
            {
                "name": swimmer_name,
                "leg": cell.get("relayLeg"),
                "eventNumber": cell["eventNumber"],
                "event": cell["event"],
                "gender": cell["gender"],
                "seedTime": cell.get("seedTime"),
                "timeStatus": cell.get("timeStatus"),
            }
        )

    for page in pages:
        right_swimmer_seen = False

        for line, column in _entry_report_page_lines(page, column_flow=column_flow):
            in_right_prefix = column == "R" and not right_swimmer_seen

            if pending_name and _entry_report_team_only_line(line):
                current_swimmer = pending_name
                if column == "R":
                    right_swimmer_seen = True
                pending_name = None
                continue

            if _entry_skip_line(line):
                continue

            if ENTRY_NAME_HEADER.match(line.strip()):
                current_swimmer = None
                pending_name = None
                in_relay_section = False
                pending_relay_letter = None
                continue

            if pending_name_continuation and re.match(r"^[A-Za-z'\-]+$", line.strip()):
                word = line.strip()
                roster = relay_rosters[-1][1]
                last = roster[-1]
                base = last.rstrip(",").strip()
                roster[-1] = f"{base}, {word}"
                pending_name_continuation = False
                continue

            roster_header = _match_relay_roster_header(line)
            if roster_header:
                in_relay_section = True
                pending_relay_letter = "A"
                continue

            if in_relay_section:
                names = _parse_relay_roster_names(line)
                if names and pending_relay_letter is not None:
                    relay_rosters.append((pending_relay_letter, names))
                    last = names[-1]
                    pending_name_continuation = (
                        last.endswith(",")
                        or ("," in last and not last.split(",", 1)[1].strip())
                    )
                pending_relay_letter = None
                in_relay_section = False
                continue

            swimmer = SWIMMER_HEADER.match(line)
            if swimmer:
                current_swimmer = swimmer.group(2).strip()
                pending_name = None
                if column == "R":
                    right_swimmer_seen = True
                continue

            standalone = _standalone_swimmer_name(line)
            if standalone:
                pending_name = standalone
                continue

            new_swimmer, row_entries = _parse_entry_report_row(line, current_swimmer)
            if new_swimmer:
                current_swimmer = new_swimmer
                pending_name = None
                if column == "R":
                    right_swimmer_seen = True

            if row_entries:
                for _swimmer_name, cell in row_entries:
                    if in_right_prefix:
                        resolved = current_swimmer
                    else:
                        resolved = _swimmer_name or current_swimmer
                    if not resolved:
                        continue
                    if cell.get("isRelay"):
                        append_relay_leg(resolved, cell)
                    else:
                        append_individual(resolved, cell)
                continue

            if not current_swimmer and not pending_name:
                continue

            event_swimmer = current_swimmer or pending_name
            if not event_swimmer:
                continue

            for cell in _parse_entry_cells(line):
                if cell.get("isRelay"):
                    append_relay_leg(event_swimmer, cell)
                else:
                    append_individual(event_swimmer, cell)

    relay_teams = _group_relay_leg_entries(relay_legs, relay_rosters)
    entries = individuals + relay_teams
    if not entries:
        raise ValueError(f"No {_sheet_team.code} entries found in entry report")

    return {
        "sheetType": "entries",
        "detectedSheetType": detected,
        "meet_name": meet_name,
        "course": course,
        "entries": entries,
    }


def _is_usms_multicol(text: str) -> bool:
    """USMS CCS psych/heat sheets use #N Women/Men event headers in multi-column layout."""
    return bool(USMS_MULTI_COL.search(text))


def _page_lines(page: Any, *, split_columns: bool) -> list[str]:
    if not split_columns:
        return extract_page_lines(page)

    try:
        words = page.extract_words(use_text_flow=False)
    except Exception:
        words = []
    if not words:
        return extract_page_lines(page)

    # Use detect_column_split to determine if this page is genuinely multi-column.
    # Fall back to single-column reading when no real column gap is found
    # (e.g. White & Gold format with a wide "Finals Place" column that sits beyond
    # the page midpoint but is actually part of a single-column layout).
    splits = detect_column_split(words, float(page.width), lines=page.lines)
    if not splits:
        return group_words_into_lines(words)

    # Handle 2-column or 3-column layouts
    if len(splits) == 1:
        # 2-column layout
        mid = splits[0]
        left = [w for w in words if (w["x0"] + w["x1"]) / 2.0 < mid]
        right = [w for w in words if (w["x0"] + w["x1"]) / 2.0 >= mid]
        return group_words_into_lines(left) + group_words_into_lines(right)
    elif len(splits) == 2:
        # 3-column layout
        split1, split2 = splits
        left = [w for w in words if (w["x0"] + w["x1"]) / 2.0 < split1]
        middle = [w for w in words if split1 <= (w["x0"] + w["x1"]) / 2.0 < split2]
        right = [w for w in words if (w["x0"] + w["x1"]) / 2.0 >= split2]
        return (
            group_words_into_lines(left)
            + group_words_into_lines(middle)
            + group_words_into_lines(right)
        )
    else:
        # Fallback for unexpected split count
        return group_words_into_lines(words)


def _cluster_column_starts(xs: list[float], gap: float = 50.0, min_size: int = 10) -> list[float]:
    """Cluster x positions into column start anchors, left to right.

    Uses each cluster's minimum so event headers that sit slightly left of
    entry ranks still land in the same column as those entries. Tiny clusters
    (front-matter noise) are dropped.
    """
    if not xs:
        return [0.0]
    ordered = sorted(xs)
    clusters: list[list[float]] = [[ordered[0]]]
    for x in ordered[1:]:
        if x - clusters[-1][-1] <= gap:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    kept = [cluster for cluster in clusters if len(cluster) >= min_size]
    if not kept:
        kept = clusters
    return [min(cluster) for cluster in kept]


def _detect_usms_column_bounds(pdf: Any) -> list[float]:
    """Return left edges of each column from entry lanes/ranks, heats, and event headers."""
    starts: list[float] = []
    for page in pdf.pages:
        page_text = page.extract_text() or ""
        if (
            not USMS_MULTI_COL.search(page_text)
            and not HEAT_HEADER.search(page_text)
            and not HEAT_ABC_FINAL.search(page_text)
        ):
            continue
        try:
            words = page.extract_words(use_text_flow=False)
        except Exception:
            continue
        by_y: dict[int, list[dict]] = {}
        for word in words:
            by_y.setdefault(round(word["top"]), []).append(word)
        for row_words in by_y.values():
            row = sorted(row_words, key=lambda w: w["x0"])
            for i, word in enumerate(row):
                text = word["text"]
                if text.startswith("#") or text == "Heat":
                    starts.append(float(word["x0"]))
                elif (
                    text.isdigit()
                    and i + 1 < len(row)
                    and row[i + 1]["text"].endswith(",")
                ):
                    dist_prev = 999.0
                    if i > 0:
                        dist_prev = float(word["x0"]) - float(row[i - 1]["x1"])
                    if dist_prev >= 18.0:
                        starts.append(float(word["x0"]))
    return _cluster_column_starts(starts)


def _column_index(x: float, bounds: list[float]) -> int:
    idx = 0
    for i, start in enumerate(bounds):
        if x + 1e-6 >= start:
            idx = i
        else:
            break
    return idx


def _usms_column_lines(page: Any, bounds: list[float]) -> list[list[str]]:
    """Return lines for each column, left to right, top to bottom within each column."""
    try:
        words = page.extract_words(use_text_flow=False)
    except Exception:
        words = []
    if not words:
        text = _clean_line((page.extract_text() or "").strip())
        return [[text]] if text else [[]]

    columns: list[list[dict]] = [[] for _ in bounds]
    for word in words:
        columns[_column_index(float(word["x0"]), bounds)].append(word)

    return [group_words_into_lines(col_words) for col_words in columns]


def _consume_usms_event(
    line: str,
    pending: tuple[str, str, str] | None,
) -> tuple[dict[str, Any] | None, tuple[str, str, str] | None]:
    """Update event state from one column line. Returns (new_event, new_pending)."""
    if not line:
        return None, pending

    if pending and STROKE_CONT.match(line):
        event_num, gender_label, distance_part = pending
        return _build_event(event_num, gender_label, f"{distance_part} {line}"), None

    partial = EVENT_USMS_PARTIAL.match(line)
    if partial:
        return None, partial.groups()

    event = _parse_usms_event_line(line)
    if event:
        return event, None

    return None, pending


def _parse_heat_header(line: str) -> dict[str, Any] | None:
    match = HEAT_HEADER.search(line)
    if match:
        heat_num, heat_total, round_label, start_time = match.groups()
        return {
            "heat": int(heat_num),
            "heatTotal": int(heat_total),
            "round": round_label.lower().replace(" ", "_"),
            "startTime": start_time,
        }
    abc = HEAT_ABC_FINAL.search(line)
    if abc:
        heat_num, _letter = abc.groups()
        return {
            "heat": int(heat_num),
            "heatTotal": None,
            "round": "finals",
            "startTime": None,
        }
    return None


def _remember_heat_total(
    event_heat_totals: dict[int, int],
    event_max_heat: dict[int, int],
    event_num: int,
    heat: dict[str, Any],
) -> dict[str, Any]:
    """Record heat totals for an event and fill heatTotal when known from other headers."""
    heat_num = heat.get("heat")
    if isinstance(heat_num, int):
        event_max_heat[event_num] = max(event_max_heat.get(event_num, 0), heat_num)

    heat_total = heat.get("heatTotal")
    if isinstance(heat_total, int):
        event_heat_totals[event_num] = max(event_heat_totals.get(event_num, 0), heat_total)
    elif isinstance(heat_num, int) and event_num in event_heat_totals:
        heat = {**heat, "heatTotal": event_heat_totals[event_num]}

    return heat


def _backfill_heat_totals(
    entries: list[dict[str, Any]],
    event_heat_totals: dict[int, int],
    event_max_heat: dict[int, int],
) -> None:
    """Fill missing heatTotal from known totals or the highest heat seen for that event."""
    for entry in entries:
        if entry.get("heat") is None or entry.get("heatTotal") is not None:
            continue
        event_num = entry.get("eventNumber")
        if not isinstance(event_num, int):
            continue
        total = event_heat_totals.get(event_num) or event_max_heat.get(event_num)
        if total is not None:
            entry["heatTotal"] = total


def _parse_usms_sheet_pages(pdf: Any, sheet_type: str) -> list[dict[str, Any]]:
    """Read columns left-to-right, top-to-bottom, with one current event (and heat).

    Hy-Tek multi-column psych and meet-program sheets flow an event across
    columns and pages in reading order: finish the left column, continue in
    the next column to the right, then the next page's left column, and so on.
    """
    bounds = _detect_usms_column_bounds(pdf)
    current_event: dict[str, Any] | None = None
    current_heat: dict[str, Any] | None = None
    session_round: str | None = None
    in_alternates = False
    pending: tuple[str, str, str] | None = None
    pending_relay: dict[str, Any] | None = None
    event_heat_totals: dict[int, int] = {}
    event_max_heat: dict[int, int] = {}
    entries: list[dict[str, Any]] = []

    for page in pdf.pages:
        columns = _usms_column_lines(page, bounds)
        for lines in columns:
            for raw_line in lines:
                line = _clean_line(raw_line)
                if not line:
                    continue

                detected_session = _session_round_from_line(line)
                if detected_session:
                    session_round = detected_session

                if SKIP_LINE.search(line) or TEAM_SUMMARY.match(line) or COLUMN_HEADER.match(line):
                    continue

                if ALTERNATES_HEADER.match(line):
                    in_alternates = True
                    pending_relay = None
                    if current_heat is None or current_heat.get("heat") is not None:
                        current_heat = {
                            "heat": None,
                            "heatTotal": None,
                            "round": (current_heat or {}).get("round")
                            or session_round
                            or "finals",
                            "startTime": None,
                        }
                    continue

                default_round = session_round or "prelims"
                embedded = _parse_heat_with_event(line, default_round=default_round)
                if embedded:
                    current_event, current_heat = embedded
                    in_alternates = False
                    pending = None
                    pending_relay = None
                    current_heat = _remember_heat_total(
                        event_heat_totals,
                        event_max_heat,
                        current_event["eventNumber"],
                        current_heat,
                    )
                else:
                    event, pending = _consume_usms_event(line, pending)
                    if event:
                        current_event = event
                        current_heat = None
                        in_alternates = False
                        pending_relay = None

                    heat = _parse_heat_header(line)
                    if heat and current_event:
                        in_alternates = False
                        current_heat = _remember_heat_total(
                            event_heat_totals,
                            event_max_heat,
                            current_event["eventNumber"],
                            heat,
                        )
                    elif heat:
                        in_alternates = False
                        current_heat = heat

                if not current_event:
                    continue

                if current_event.get("isRelay"):
                    relay = _parse_relay_team(
                        line,
                        sheet_type=sheet_type,
                        event=current_event,
                        heat=current_heat if sheet_type == "heat" else None,
                        alternate=in_alternates,
                    )
                    if relay:
                        pending_relay = relay
                        entries.append(relay)
                        continue

                    if pending_relay and len(pending_relay.get("relaySwimmers", [])) < 4:
                        offset = len(pending_relay["relaySwimmers"])
                        legs = _parse_relay_leg(line, offset=offset)
                        if legs:
                            swimmers = pending_relay["relaySwimmers"]
                            for leg in legs:
                                if len(swimmers) >= 4:
                                    break
                                swimmers.append(leg)
                            continue

                    if re.match(r"^\d+\s+[A-Z0-9]", line) and not _sheet_team.relay_re().match(line):
                        pending_relay = None
                    continue

                for individual in _parse_individual(
                    line,
                    sheet_type=sheet_type,
                    event=current_event,
                    heat=current_heat if sheet_type == "heat" else None,
                    alternate=in_alternates,
                ):
                    entries.append(individual)

    if sheet_type == "heat":
        _backfill_heat_totals(entries, event_heat_totals, event_max_heat)

    return entries


def _extract_lines(pdf: Any, sheet_type: str) -> list[str]:
    # Enable column splitting for both psych sheets and heat sheets to handle
    # two-column layouts where women's and men's events are side-by-side.
    split_columns = sheet_type in ("heat", "psych")
    lines: list[str] = []
    for page in pdf.pages:
        for line in _page_lines(page, split_columns=split_columns):
            cleaned = _clean_line(line)
            for part in _split_program_line(cleaned):
                if part:
                    lines.append(part)
    return lines


def _event_seed_bucket(event: dict[str, Any]) -> str:
    kind = "R" if event.get("isRelay") else "I"
    return f"{event.get('eventNumber', 0)}|{event.get('event', '')}|{event.get('gender', '')}|{kind}"


def _seed_time_ms(token: str | None) -> float | None:
    raw = (token or "").strip().upper()
    if not raw or raw in {"NT", "NQT", "DFS", "SCR", "DNS", "NS", "DQ", "DNF"}:
        return None
    try:
        if ":" in raw:
            minutes, seconds = raw.split(":", 1)
            return (int(minutes) * 60 + float(seconds)) * 1000
        return float(raw) * 1000
    except ValueError:
        return None


def _collect_line_seed_times(
    line: str,
    event: dict[str, Any],
    buckets: dict[str, list[str]],
) -> None:
    key = _event_seed_bucket(event)
    times = buckets.setdefault(key, [])
    if event.get("isRelay"):
        for match in RELAY_SEED_ANY.finditer(line):
            times.append(match.group(4))
        return
    for match in INDIVIDUAL_SEED_ANY.finditer(line):
        times.append(match.group(2))


def _assign_seed_ranks_from_event_times(
    entries: list[dict[str, Any]],
    buckets: dict[str, list[str]],
) -> None:
    ranks_by_bucket: dict[str, dict[float, int]] = {}
    for key, times in buckets.items():
        parsed = sorted(
            ms
            for token in times
            if (ms := _seed_time_ms(token)) is not None
        )
        ranks: dict[float, int] = {}
        index = 0
        while index < len(parsed):
            ms = parsed[index]
            rank = index + 1
            while index < len(parsed) and parsed[index] == ms:
                ranks[ms] = rank
                index += 1
        ranks_by_bucket[key] = ranks

    for entry in entries:
        if entry.get("seedRank"):
            continue
        ms = _seed_time_ms(entry.get("seedTime"))
        if ms is None:
            continue
        rank = ranks_by_bucket.get(_event_seed_bucket(entry), {}).get(ms)
        if rank:
            entry["seedRank"] = rank


def parse_sheet_pdf_bytes(
    content: bytes,
    sheet_type: str | None = None,
    team: str | None = None,
) -> dict[str, Any]:
    _use_sheet_team(team)
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        all_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        detected_type = _detect_sheet_type(all_text)
        meet_name = _sheet_meet_name(all_text)
        course = detect_course(all_text)
        parse_as = sheet_type or (
            detected_type if detected_type in {"psych", "heat", "entries"} else "psych"
        )
        known_types = {"psych", "heat", "entries", "results", "packet"}
        wrong_type = detected_type in known_types and detected_type != parse_as
        entries_unrecognized = parse_as == "entries" and detected_type != "entries"
        if wrong_type or entries_unrecognized:
            return {
                "sheetType": parse_as if parse_as in {"psych", "heat", "entries"} else "psych",
                "detectedSheetType": detected_type,
                "meet_name": meet_name,
                "course": course,
                "entries": [],
            }
        if parse_as == "entries":
            result = parse_entry_report(content, team=_sheet_team.code)
            result["detectedSheetType"] = detected_type
            if meet_name and not result.get("meet_name"):
                result["meet_name"] = meet_name
            return result
        if parse_as not in {"psych", "heat"}:
            parse_as = "psych"
        usms_multicol = _is_usms_multicol(all_text)

        if usms_multicol:
            entries = _parse_usms_sheet_pages(pdf, parse_as)
            if entries:
                return {
                    "sheetType": parse_as,
                    "detectedSheetType": detected_type,
                    "meet_name": meet_name,
                    "course": course,
                    "entries": entries,
                }

        lines = _extract_lines(pdf, parse_as)

    entries: list[dict[str, Any]] = []
    current_event: dict[str, Any] | None = None
    current_heat: dict[str, Any] | None = None
    session_round: str | None = None
    in_alternates = False
    pending_relay: dict[str, Any] | None = None
    event_heat_totals: dict[int, int] = {}
    event_max_heat: dict[int, int] = {}
    event_seed_times: dict[str, list[str]] = {}

    for line in lines:
        detected_session = _session_round_from_line(line)
        if detected_session:
            session_round = detected_session

        if SKIP_LINE.search(line) or TEAM_SUMMARY.match(line):
            continue

        if COLUMN_HEADER.match(line):
            continue

        if ALTERNATES_HEADER.match(line):
            in_alternates = True
            pending_relay = None
            current_heat = {
                "heat": None,
                "heatTotal": None,
                "round": (current_heat or {}).get("round") or session_round or "finals",
                "startTime": None,
            }
            continue

        default_round = session_round or "prelims"
        embedded = _parse_heat_with_event(line, default_round=default_round)
        if embedded:
            current_event, current_heat = embedded
            in_alternates = False
            current_heat = _remember_heat_total(
                event_heat_totals,
                event_max_heat,
                current_event["eventNumber"],
                current_heat,
            )
            pending_relay = None
            continue

        event = _parse_event_header(line)
        if event:
            current_event = event
            current_heat = None
            in_alternates = False
            pending_relay = None
            continue

        heat = _parse_heat_header(line)
        if heat:
            in_alternates = False
            if current_event:
                current_heat = _remember_heat_total(
                    event_heat_totals,
                    event_max_heat,
                    current_event["eventNumber"],
                    heat,
                )
            else:
                current_heat = heat
            continue

        if not current_event:
            continue

        if parse_as == "heat":
            _collect_line_seed_times(line, current_event, event_seed_times)

        if current_event.get("isRelay"):
            # Use finditer to handle multiple relay entries on the same line (2-column layout)
            found_any_relay = False
            for match in _sheet_team.relay_re().finditer(line):
                rank, team, letter, time = match.groups()
                relay: dict[str, Any] = {
                    "entryType": "relay_team",
                    "team": team.upper(),
                    "relayLetter": normalize_relay_letter(letter),
                    "eventNumber": current_event["eventNumber"],
                    "event": current_event["event"],
                    "gender": current_event["gender"],
                    "isRelay": True,
                    "relaySwimmers": [],
                    "seedTime": time if time.upper() not in {"NT", "NQT", "DFS", "SCR"} else None,
                    "timeStatus": time.upper() if time.upper() in {"NT", "NQT", "DFS", "SCR"} else None,
                }

                if in_alternates:
                    relay["seedRank"] = int(rank)
                    relay["alternate"] = True
                    relay["round"] = (current_heat or {}).get("round") or session_round or "finals"
                elif parse_as == "psych" or not current_heat:
                    relay["seedRank"] = int(rank)
                else:
                    relay["lane"] = int(rank)
                    for key, value in current_heat.items():
                        if value is not None:
                            relay[key] = value

                pending_relay = relay
                entries.append(relay)
                found_any_relay = True

            if found_any_relay:
                continue

            # If no matches, try to parse legs for an existing relay
            if pending_relay and len(pending_relay.get("relaySwimmers", [])) < 4:
                offset = len(pending_relay.get("relaySwimmers", []))
                legs = _parse_relay_leg(line, offset=offset)
                if legs:
                    swimmers = pending_relay["relaySwimmers"]
                    for leg in legs:
                        if len(swimmers) >= 4:
                            break
                        swimmers.append(leg)
                    continue

            if re.match(r"^\d+\s+[A-Z0-9]", line) and not _sheet_team.relay_re().match(line):
                pending_relay = None
            continue

        individuals = _parse_individual(
            line,
            sheet_type=parse_as,
            event=current_event,
            heat=current_heat,
            alternate=in_alternates,
        )
        if individuals:
            pending_relay = None
            entries.extend(individuals)
            continue

        if re.match(r"^\d+\s+[A-Z0-9]", line) and not INDIVIDUAL_ROW.match(line):
            pending_relay = None

    if parse_as == "heat":
        _backfill_heat_totals(entries, event_heat_totals, event_max_heat)
        for entry in entries:
            time = entry.get("seedTime")
            if time:
                event_seed_times.setdefault(_event_seed_bucket(entry), []).append(str(time))
        _assign_seed_ranks_from_event_times(entries, event_seed_times)

    if not entries:
        raise ValueError(f"No {_sheet_team.code} entries found in sheet")

    return {
        "sheetType": parse_as,
        "detectedSheetType": detected_type,
        "meet_name": meet_name,
        "course": course,
        "entries": entries,
    }
