"""Parse USMS / club Nationals Qualifying Times (NQT) PDFs.

Expected layout (three columns): Women time | Event | Men time

  Women                        Event                  Men
    25.99                     50 Free                 22.29
   ...
 QUAL for 4x100 Free Relay      4x200 Free Relay   QUAL for 4x100 Free Relay
"""

from __future__ import annotations

import io
import re
from typing import Any

TIME_TOKEN = re.compile(r"^(?:\d{1,2}:)?\d{1,2}\.\d{2}$")
QUAL_REF = re.compile(r"^QUAL\s+for\s+(.+)$", re.I)
DASH_TOKEN = re.compile(r"^-+$")
TITLE_YEAR = re.compile(r"\b(20\d{2})\b")
COURSE_HINT = re.compile(r"\b(SCY|LCM|SCM)\b", re.I)

STROKE_ALIASES: dict[str, str] = {
    "freestyle": "Free",
    "free": "Free",
    "backstroke": "Back",
    "back": "Back",
    "breaststroke": "Breast",
    "breast": "Breast",
    "butterfly": "Fly",
    "fly": "Fly",
    "individual medley": "IM",
    "im": "IM",
    "medley": "Medley",
}


def time_token_to_ms(token: str) -> int | None:
    cleaned = token.strip()
    if not TIME_TOKEN.match(cleaned):
        return None
    if ":" in cleaned:
        minutes, seconds = cleaned.split(":", 1)
        return int(minutes) * 60_000 + int(round(float(seconds) * 1000))
    return int(round(float(cleaned) * 1000))


INDIVIDUAL_EVENT = re.compile(
    r"^(\d{2,4})\s+"
    r"(Free|Back|Breast|Fly|IM|"
    r"Freestyle|Backstroke|Breaststroke|Butterfly|"
    r"Individual\s+Medley)$",
    re.I,
)
RELAY_EVENT = re.compile(
    r"^(?:"
    r"(?:(\d)\s*[xX×]\s*(\d{2,3})|(\d{2,4}))\s+"
    r"(?:Mixed\s+)?"
    r"(Free|Freestyle|Medley)\s+Relay"
    r")$",
    re.I,
)


def _normalize_stroke(raw: str) -> str:
    key = re.sub(r"\s+", " ", raw.strip().lower())
    return STROKE_ALIASES.get(key, raw.strip().title())


def format_nqt_event_label(raw: str) -> str | None:
    """PDF-facing event label (keeps 4x50 Free Relay style)."""
    text = re.sub(r"\s+", " ", (raw or "").strip())
    if not text:
        return None

    relay = RELAY_EVENT.match(text)
    if relay:
        legs, leg_dist, total, stroke_raw = relay.groups()
        stroke = _normalize_stroke(stroke_raw or "")
        if stroke == "IM":
            stroke = "Medley"
        elif "free" in stroke.lower():
            stroke = "Free"
        elif "medley" in stroke.lower():
            stroke = "Medley"
        mixed = bool(re.search(r"\bmixed\b", text, re.I))
        prefix = "Mixed " if mixed else ""
        if legs and leg_dist:
            return f"{legs}x{leg_dist} {prefix}{stroke} Relay".replace("  ", " ").strip()
        return f"{total} {prefix}{stroke} Relay".replace("  ", " ").strip()

    individual = INDIVIDUAL_EVENT.match(text)
    if individual:
        distance = int(individual.group(1))
        stroke = _normalize_stroke(individual.group(2))
        return f"{distance} {stroke}"

    return None


def normalize_nqt_event(raw: str) -> str | None:
    """SwimCloud-style names for cut matching ('50 Free', '200 Free Relay')."""
    text = re.sub(r"\s+", " ", (raw or "").strip())
    if not text:
        return None

    relay = RELAY_EVENT.match(text)
    if relay:
        legs, leg_dist, total, stroke_raw = relay.groups()
        if legs and leg_dist:
            distance = int(legs) * int(leg_dist)
        else:
            distance = int(total or 0)
        stroke = _normalize_stroke(stroke_raw or "")
        if stroke == "IM":
            stroke = "Medley"
        elif "free" in stroke.lower():
            stroke = "Free"
        elif "medley" in stroke.lower():
            stroke = "Medley"
        mixed = bool(re.search(r"\bmixed\b", text, re.I))
        prefix = "Mixed " if mixed else ""
        return f"{distance} {prefix}{stroke} Relay".replace("  ", " ").strip()

    individual = INDIVIDUAL_EVENT.match(text)
    if individual:
        distance = int(individual.group(1))
        stroke = _normalize_stroke(individual.group(2))
        return f"{distance} {stroke}"

    return None


def _side_display(token: str) -> str:
    """Exact PDF cell text: time, QUAL for …, or --."""
    cleaned = re.sub(r"\s+", " ", (token or "").strip())
    if not cleaned or DASH_TOKEN.match(cleaned):
        return "--"
    qual = QUAL_REF.match(cleaned)
    if qual:
        ref_label = format_nqt_event_label(qual.group(1).strip()) or qual.group(1).strip()
        return f"QUAL for {ref_label}"
    if TIME_TOKEN.match(cleaned):
        return cleaned
    return cleaned


def _parse_side_token(token: str) -> tuple[int | None, str | None]:
    """Return (timeMs, qualRefNormalizedOrNone). Dash → (None, None)."""
    cleaned = re.sub(r"\s+", " ", (token or "").strip())
    if not cleaned or DASH_TOKEN.match(cleaned):
        return None, None
    qual = QUAL_REF.match(cleaned)
    if qual:
        ref = normalize_nqt_event(qual.group(1).strip())
        return None, ref
    if TIME_TOKEN.match(cleaned):
        return time_token_to_ms(cleaned), None
    return None, None


def _split_row(line: str) -> tuple[str, str, str] | None:
    """Split a layout line into women | event | men columns."""
    stripped = line.strip()
    if not stripped:
        return None

    low = stripped.lower()
    if low in {"women", "men", "event"}:
        return None
    if "qualifying times" in low and "women" not in low:
        return None

    tokens = stripped.split()
    if len(tokens) < 2:
        return None

    for left_n in range(1, len(tokens) - 1):
        for right_n in range(1, len(tokens) - left_n):
            left = " ".join(tokens[:left_n])
            right = " ".join(tokens[-right_n:])
            center = " ".join(tokens[left_n : len(tokens) - right_n])
            if format_nqt_event_label(center):
                left_ok = (
                    TIME_TOKEN.match(left)
                    or QUAL_REF.match(left)
                    or DASH_TOKEN.match(left)
                )
                right_ok = (
                    TIME_TOKEN.match(right)
                    or QUAL_REF.match(right)
                    or DASH_TOKEN.match(right)
                )
                if left_ok and right_ok:
                    return left, center, right

    m = re.match(r"^(.+?)\s{2,}(.+?)\s{2,}(.+)$", stripped)
    if m:
        left, center, right = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
        if format_nqt_event_label(center):
            return left, center, right

    return None


def parse_nqt_text(text: str) -> dict[str, Any]:
    year_label: str | None = None
    course: str | None = None
    table: list[dict[str, str]] = []
    cuts: list[dict[str, Any]] = []
    pending_refs: list[tuple[str, str, str, str]] = []  # event, gender, ref, display

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not year_label:
            ym = TITLE_YEAR.search(line)
            if ym and "national" in line.lower():
                year_label = ym.group(1)
        if not course:
            cm = COURSE_HINT.search(line)
            if cm:
                course = cm.group(1).upper()

        split = _split_row(line)
        if not split:
            continue
        left, center, right = split
        label = format_nqt_event_label(center)
        event = normalize_nqt_event(center)
        if not label or not event:
            continue

        women = _side_display(left)
        men = _side_display(right)
        table.append({"women": women, "event": label, "men": men})

        is_relay = "relay" in event.lower()
        for gender, token, display in (("F", left, women), ("M", right, men)):
            ms, ref = _parse_side_token(token)
            if ms is not None:
                cuts.append(
                    {
                        "event": event,
                        "gender": gender,
                        "timeMs": ms,
                        "note": None,
                        "isRelay": is_relay,
                        "display": display,
                    }
                )
            elif ref:
                pending_refs.append((event, gender, ref, display))

    by_key = {(c["event"].lower(), c["gender"]): c for c in cuts}
    for event, gender, ref, display in pending_refs:
        source = by_key.get((ref.lower(), gender))
        if not source:
            continue
        entry = {
            "event": event,
            "gender": gender,
            "timeMs": source["timeMs"],
            "note": display,
            "isRelay": "relay" in event.lower(),
            "display": display,
        }
        cuts.append(entry)
        by_key[(event.lower(), gender)] = entry

    dedup: dict[tuple[str, str], dict[str, Any]] = {}
    for c in cuts:
        dedup[(c["event"].lower(), c["gender"])] = c

    return {
        "yearLabel": year_label,
        "course": course,
        "table": table,
        "cuts": list(dedup.values()),
    }


def parse_nqt_pdf_bytes(content: bytes) -> dict[str, Any]:
    import pdfplumber

    texts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            page_text = ""
            try:
                page_text = page.extract_text(layout=True) or ""
            except TypeError:
                page_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            if not page_text.strip():
                page_text = _text_from_words(page) or ""
            texts.append(page_text)

    result = parse_nqt_text("\n".join(texts))
    if len(result["cuts"]) >= 8 or len(result["table"]) >= 8:
        return result

    rebuilt: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            rebuilt.append(_text_from_words(page))
    return parse_nqt_text("\n".join(rebuilt))


def _text_from_words(page: Any) -> str:
    """Rebuild left-to-right, top-to-bottom lines from word bounding boxes."""
    words = page.extract_words() or []
    if not words:
        return ""
    words = sorted(words, key=lambda w: (round(float(w["top"]) / 3) * 3, float(w["x0"])))
    lines: list[list[dict[str, Any]]] = []
    for word in words:
        top = float(word["top"])
        if not lines or abs(top - float(lines[-1][0]["top"])) > 6:
            lines.append([word])
        else:
            lines[-1].append(word)
    out: list[str] = []
    for line_words in lines:
        line_words.sort(key=lambda w: float(w["x0"]))
        parts: list[str] = []
        prev_x1: float | None = None
        for w in line_words:
            x0 = float(w["x0"])
            if prev_x1 is not None and x0 - prev_x1 > 20:
                parts.append("  ")
            elif parts:
                parts.append(" ")
            parts.append(str(w["text"]))
            prev_x1 = float(w["x1"])
        out.append("".join(parts))
    return "\n".join(out)
