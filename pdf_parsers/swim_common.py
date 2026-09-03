"""Pure swim-data helpers shared by the PDF parsers and the desktop SwimPhone
scraper. No pdfplumber/network dependency — safe to ship standalone in the
scraper download bundle.
"""

from __future__ import annotations

import re

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

_VALID_RELAY_LETTERS = frozenset({"A", "B", "C", "D"})


def normalize_relay_letter(letter: str | None) -> str | None:
    """Return A–D relay letter, or None when missing / not a team letter."""
    token = (letter or "").strip().upper()
    if token in _VALID_RELAY_LETTERS:
        return token
    return None


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
