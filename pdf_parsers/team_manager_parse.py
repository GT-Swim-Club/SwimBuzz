"""Hy-Tek TEAM MANAGER "Individual Meet Results" reports.

Unlike Meet Manager results (by event), Team Manager lists each swimmer with their swims:

    Josie Benner (19) W
    NS F # 4 Mixed 19-24 200 Breast GTSC-GA --- ---
    Casey Boland (20) W
    30.39Y F # 9 Mixed 19-24 50 Fly GTSC-GA 5 ---

A club prints it for its own time trials, so every swimmer is the club's. Names print
"First Last" (the first word is taken as the given name), gender is the swimmer's W/M, and
the course is the time's Y/L/S suffix. Places are within age groups ("18 & Under",
"19-24"), not the event's, so they're left out.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from .swim_common import INVALID_TIMES, parse_time_token

_BANNER = re.compile(r"HY-TEK'?s\s+TEAM\s+MANAGER", re.I)
_TITLE = re.compile(r"^\s*Individual\s+Meet\s+Results\s*$", re.I | re.M)

_ATHLETE = re.compile(r"^(?P<name>.+?)\s+\((?P<age>\d{1,3})\)\s+(?P<gender>[WMF])\s*$")
_STATUS = "|".join(sorted(INVALID_TIMES, key=len, reverse=True))
_SWIM = re.compile(
    rf"^(?P<time>(?:{_STATUS})|[xX]?(?:\d{{1,2}}:)?\d{{1,2}}\.\d{{2}})(?P<course>[YLS])?\s+"
    r"(?P<round>[FPS])\s+#\s*(?P<number>\d+)\s+"
    r"(?:Mixed|Women|Men|Girls|Boys|Female|Male)\s+.*?"
    r"(?P<distance>\d{2,4})\s+(?P<stroke>Free|Back|Breast|Fly|IM)\s+"
    r"(?P<team>\S+)\s+(?P<place>\d+|-+)\s+(?P<points>[\d.]+|-+)\s*$",
    re.I,
)
# "GTSC Time Trials - Fall 2019 18-Nov-19 to 19-Nov-19 Yards"
_MEET_LINE = re.compile(
    r"^(?P<name>.+?)\s+(?P<start>\d{1,2}-[A-Za-z]{3}-\d{2,4})"
    r"(?:\s+to\s+\d{1,2}-[A-Za-z]{3}-\d{2,4})?\s*(?P<course>Yards|Meters|LCM|SCM|SCY)?\s*$"
)
_COURSE_SUFFIX = {"Y": "SCY", "L": "LCM", "S": "SCM"}


def is_team_manager_report(first_page_text: str) -> bool:
    return bool(_BANNER.search(first_page_text) and _TITLE.search(first_page_text))


def _first_last_to_last_first(name: str) -> str:
    parts = name.split()
    if len(parts) < 2:
        return name.strip()
    return f"{' '.join(parts[1:])}, {parts[0]}"


def _iso(day: str) -> str | None:
    for fmt in ("%d-%b-%y", "%d-%b-%Y"):
        try:
            return datetime.strptime(day, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_team_manager_report(pages: list[str], default_course: str = "SCY") -> dict[str, Any]:
    """Meet name/date and individual swims from a Team Manager meet-results report."""
    meet_name: str | None = None
    meet_date: str | None = None
    course = default_course
    athlete: dict[str, str] | None = None
    rows: list[dict[str, Any]] = []
    has_prelims = False

    for page in pages:
        for raw in page.splitlines():
            line = raw.strip()
            if not line or _BANNER.search(line) or _TITLE.match(line):
                continue
            if meet_name is None:
                meet = _MEET_LINE.match(line)
                if meet:
                    meet_name = meet.group("name").strip()
                    meet_date = _iso(meet.group("start"))
                    unit = (meet.group("course") or "").lower()
                    if unit in {"meters", "lcm"}:
                        course = "LCM"
                    elif unit == "scm":
                        course = "SCM"
                    elif unit:
                        course = "SCY"
                    continue
            swim = _SWIM.match(line)
            if swim and athlete:
                token = swim.group("time")
                status = token.upper() if token.upper() in INVALID_TIMES else None
                time = status or parse_time_token(token)
                if not time:
                    continue
                round_tag = swim.group("round").upper()
                has_prelims = has_prelims or round_tag == "P"
                rows.append(
                    {
                        "name": athlete["name"],
                        "event": f"{swim.group('distance')} {swim.group('stroke')}",
                        "time": time,
                        "course": _COURSE_SUFFIX.get((swim.group("course") or "").upper(), course),
                        "tags": round_tag,
                        "place": None,
                        "team": swim.group("team"),
                        "gender": athlete["gender"],
                    }
                )
                continue
            person = _ATHLETE.match(line)
            if person:
                athlete = {
                    "name": _first_last_to_last_first(person.group("name")),
                    "gender": "F" if person.group("gender").upper() in {"W", "F"} else "M",
                }

    # Finals tags only mean something beside prelims; a time trial's swims are timed finals.
    for row in rows:
        if row["tags"] == "F" and not has_prelims:
            row["tags"] = ""

    return {
        "course": course,
        "meet_name": meet_name,
        "meet_date": meet_date,
        "results": rows,
    }
