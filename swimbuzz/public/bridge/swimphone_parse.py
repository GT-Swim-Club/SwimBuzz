"""Scrape meet results from SwimPhone event pages."""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from pdf_parse import (
    INVALID_TIMES,
    normalize_event,
    normalize_relay_letter,
    parse_status_token,
    parse_time_token,
    leg_times_from_cumulative,
)

BASE_URL = "https://www.swimphone.com/meets/"
EVENT_ORDER_PATH = "event_order.cfm"
MEET_MENU_PATH = "meet_menu.cfm"

STROKE_ALIASES = {
    "free": "Free",
    "back": "Back",
    "breast": "Breast",
    "fly": "Fly",
    "im": "IM",
    "individual medley": "IM",
}


class SwimPhoneCaptchaError(Exception):
    """Raised when SwimPhone blocks archived meet results behind reCAPTCHA."""


class SwimPhoneParseError(Exception):
    pass


class SwimPhoneAccessError(SwimPhoneParseError):
    """Raised when SwimPhone blocks the scraper (datacenter IP, bot detection, etc.)."""


BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def _playwright_headless() -> bool:
    return os.environ.get("PLAYWRIGHT_HEADLESS", "true").lower() in ("1", "true", "yes")


@dataclass
class SwimPhoneEvent:
    event_num: int
    gender: str
    distance: str
    stroke: str
    course: str
    label: str
    results_url: str | None
    is_relay: bool = False
    date: str | None = None


# Stroke labels as they appear in the relay splits swimmer table
STROKE_FROM_SPLIT = {
    "back": "Back",
    "backstroke": "Back",
    "breast": "Breast",
    "breaststroke": "Breast",
    "fly": "Fly",
    "butterfly": "Fly",
    "free": "Free",
    "freestyle": "Free",
}


def extract_smid(url: str) -> int:
    parsed = urlparse(url.strip())
    if "swimphone.com" not in parsed.netloc.lower():
        raise SwimPhoneParseError("URL must be a swimphone.com meet link")

    query = parse_qs(parsed.query)
    smid_raw = (query.get("smid") or [None])[0]
    if not smid_raw or not str(smid_raw).isdigit():
        raise SwimPhoneParseError(
            "Could not find meet ID (smid) in URL — paste a link like "
            "https://www.swimphone.com/meets/meet_menu.cfm?smid=12345"
        )
    return int(smid_raw)


def _course_from_distance_token(token: str, meet_default: str) -> tuple[str, str]:
    cleaned = token.strip()
    match = re.match(r"^(\d+)\s*([YLM])?\s*$", cleaned, re.I)
    if not match:
        return cleaned, meet_default

    distance = match.group(1)
    code = (match.group(2) or "").upper()
    if code == "Y":
        return distance, "SCY"
    if code == "L":
        return distance, "LCM"
    if code == "M":
        return distance, "SCM"
    return distance, meet_default


def _default_course_from_text(text: str) -> str:
    upper = text.upper()
    if "SCM" in upper or "SHORT COURSE METER" in upper:
        return "SCM"
    if "LCM" in upper or "LONG COURSE" in upper:
        return "LCM"
    if "SCY" in upper or "SHORT COURSE YARD" in upper or " Y " in f" {upper} ":
        return "SCY"
    return "SCY"


def _parse_meet_date(text: str) -> str | None:
    text = unescape(text)
    iso = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", text)
    if iso:
        return f"{iso.group(1)}-{iso.group(2)}-{iso.group(3)}"

    # "Friday, April 10, 2026" or abbreviated "Sat, Feb 28, 2026" — an optional
    # weekday prefix followed by a month name (full or abbreviated), day, year.
    named = re.search(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s+(\d{4})\b", text)
    if named:
        month, day, year = named.groups()
        for fmt in ("%B", "%b"):
            try:
                dt = datetime.strptime(f"{month} {day} {year}", f"{fmt} %d %Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

    short = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", text)
    if short:
        month, day, year = short.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    return None


def _normalize_stroke(raw: str) -> str | None:
    key = raw.strip().lower()
    if "relay" in key:
        return None
    if key in STROKE_ALIASES:
        return STROKE_ALIASES[key]
    for alias, stroke in STROKE_ALIASES.items():
        if key == alias:
            return stroke
    return None


def parse_meet_metadata(html: str) -> tuple[str, str, str]:
    soup = BeautifulSoup(html, "html.parser")
    meet_name = ""
    h1 = soup.find("h1")
    if h1:
        meet_name = h1.get_text(" ", strip=True)

    meta = soup.find("meta", attrs={"name": "description"})
    meta_text = meta.get("content", "") if meta else ""
    meet_default = _default_course_from_text(f"{meet_name} {meta_text}")

    date_text = meta_text
    h2 = soup.find("h2")
    if h2:
        date_text = f"{date_text} {h2.get_text(' ', strip=True)}"
    meet_date = _parse_meet_date(date_text) or ""

    return meet_name, meet_date, meet_default


def _is_event_table(table) -> bool:
    heads = {th.get_text(strip=True).lower() for th in table.find_all("th")}
    return "event" in heads and "sex" in heads


def _parse_session_dates(soup) -> list[str]:
    """Ordered distinct meet days from the session table on the event order page.

    The event order page opens with a session table like
    ``Friday, April 10, 2026 | Session 1 - Friday Prelims`` for each session.
    Multi-day meets then list one event table per day, so the Nth event table
    lines up with the Nth distinct date here."""
    dates: list[str] = []
    for table in soup.find_all("table"):
        if _is_event_table(table):
            continue
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            parsed = _parse_meet_date(cells[0].get_text(" ", strip=True))
            if parsed and parsed not in dates:
                dates.append(parsed)
    return dates


def parse_event_order(html: str, smid: int, meet_default: str) -> list[SwimPhoneEvent]:
    soup = BeautifulSoup(html, "html.parser")
    events: list[SwimPhoneEvent] = []

    event_tables = [t for t in soup.find_all("table") if _is_event_table(t)]
    if not event_tables:
        event_tables = soup.find_all("table")

    # Each day gets its own event table; when the count of event tables matches
    # the distinct session dates, map them positionally so every swim can carry
    # the actual day it was swum. Otherwise leave dates unset and fall back to
    # the meet's start date downstream.
    session_dates = _parse_session_dates(soup)
    table_dates: dict[int, str] = {}
    if event_tables and len(event_tables) == len(session_dates):
        table_dates = {id(t): d for t, d in zip(event_tables, session_dates)}

    for table in event_tables:
        table_date = table_dates.get(id(table))
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 5:
                continue

            event_num_text = cells[0].get_text(strip=True)
            if not event_num_text.isdigit():
                continue

            gender = cells[1].get_text(strip=True)
            distance_raw = cells[2].get_text(" ", strip=True)
            stroke_raw = cells[3].get_text(" ", strip=True)
            is_relay = "relay" in stroke_raw.lower()
            stroke = _normalize_stroke(stroke_raw)
            if not stroke and not is_relay:
                continue

            distance, course = _course_from_distance_token(distance_raw, meet_default)
            if is_relay:
                label = re.sub(r"\s+", " ", f"{distance} {stroke_raw}".strip())
                stroke = stroke or "Relay"
            else:
                label = normalize_event(distance, stroke_raw) or f"{distance} {stroke}"

            results_url = None
            for link in row.select('a[href*="event_results.cfm"]'):
                href = link.get("href")
                if href:
                    results_url = urljoin(BASE_URL, href.replace("&amp;", "&"))
                    break

            events.append(
                SwimPhoneEvent(
                    event_num=int(event_num_text),
                    gender=gender,
                    distance=distance,
                    stroke=stroke,
                    course=course,
                    label=label,
                    results_url=results_url,
                    is_relay=is_relay,
                    date=table_date,
                )
            )

    if not events:
        raise SwimPhoneParseError(
            f"No events found for meet {smid}. The meet may not have results posted yet."
        )

    return events


def _is_captcha_page(html: str, title: str) -> bool:
    lower = f"{title} {html}".lower()
    return "captcha" in lower or "access archived meet" in lower


def _swimmer_column_index(headers: list[str]) -> int | None:
    """Locate the swimmer-name column across SwimPhone's table variants."""
    for i, h in enumerate(headers):
        if "swimmer" in h:
            return i
    for i, h in enumerate(headers):
        if h == "name":
            return i
    return None


def _seed_time_index(headers: list[str]) -> int | None:
    for i, h in enumerate(headers):
        norm = _normalize_header(h)
        if "seed" in norm:
            return i
    return None


def _parse_seed_from_cells(cells: list, seed_idx: int | None) -> str | None:
    if seed_idx is None or seed_idx >= len(cells):
        return None
    return parse_time_token(cells[seed_idx].get_text(" ", strip=True))


def _result_time_indices(headers: list[str]) -> list[int]:
    """Result-time column indices, most authoritative first (finals, then
    prelims, then a generic time), always skipping the seed column."""
    finals: list[int] = []
    prelims: list[int] = []
    generic: list[int] = []
    for i, h in enumerate(headers):
        if "time" not in h or "seed" in h:
            continue
        if "final" in h:
            finals.append(i)
        elif "prelim" in h:
            prelims.append(i)
        else:
            generic.append(i)
    return finals + prelims + generic


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", h.strip().lower())


def parse_place_token(text: str) -> int | None:
    """Extract finish place from a SwimPhone results cell."""
    cleaned = text.strip()
    if not cleaned or cleaned.upper() in {"NS", "DQ", "SCR", "DNS", "NT"}:
        return None
    match = re.match(r"^(\d{1,3})", cleaned)
    if not match:
        return None
    place = int(match.group(1))
    return place if place >= 1 else None


def _is_place_header(norm: str) -> bool:
    if norm in {"pl", "place", "rank", "finish", "pos", "position"}:
        return True
    if "place" in norm:
        return True
    # PrelimsPl, FinalsPl, etc.
    if norm.endswith("pl") and len(norm) > 2:
        return True
    return False


def _result_place_indices(headers: list[str]) -> tuple[int | None, int | None, int | None]:
    """Return (prelim_place_idx, final_place_idx, generic_place_idx)."""
    prelim_idx: int | None = None
    final_idx: int | None = None
    generic_idx: int | None = None
    for i, h in enumerate(headers):
        norm = _normalize_header(h)
        if not _is_place_header(norm):
            continue
        if "prelim" in norm:
            prelim_idx = i
        elif "final" in norm:
            final_idx = i
        elif generic_idx is None:
            generic_idx = i
    return prelim_idx, final_idx, generic_idx


def _place_column_index(headers: list[str]) -> int | None:
    prelim_idx, final_idx, generic_idx = _result_place_indices(headers)
    return generic_idx if generic_idx is not None else final_idx if final_idx is not None else prelim_idx


def _append_result_round(
    rounds: list[dict[str, str]], cells: list, idx: int | None, tags: str
) -> None:
    if idx is None or idx >= len(cells):
        return
    text = cells[idx].get_text(" ", strip=True)
    time_val = parse_time_token(text)
    if time_val:
        rounds.append({"time": time_val, "tags": tags})
        return
    status = parse_status_token(text)
    if status:
        rounds.append({"status": status, "tags": tags})


def _place_for_round(
    cells: list,
    round_tag: str,
    prelim_idx: int | None,
    final_idx: int | None,
    generic_idx: int | None,
) -> int | None:
    if round_tag == "P" and prelim_idx is not None and prelim_idx < len(cells):
        return parse_place_token(cells[prelim_idx].get_text(" ", strip=True))
    if round_tag == "F" and final_idx is not None and final_idx < len(cells):
        return parse_place_token(cells[final_idx].get_text(" ", strip=True))
    if not round_tag:
        if final_idx is not None and final_idx < len(cells):
            return parse_place_token(cells[final_idx].get_text(" ", strip=True))
        if prelim_idx is not None and prelim_idx < len(cells):
            return parse_place_token(cells[prelim_idx].get_text(" ", strip=True))
    if generic_idx is not None and generic_idx < len(cells):
        return parse_place_token(cells[generic_idx].get_text(" ", strip=True))
    return None


def _club_column_index(headers: list[str]) -> int | None:
    for i, h in enumerate(headers):
        norm = _normalize_header(h)
        if norm in {"club", "team", "teamcode"}:
            return i
    return None


def parse_heat_lane_token(text: str) -> tuple[int | None, int | None]:
    """Parse SwimPhone HT/LN cells like ``2/4`` (heat 2, lane 4)."""
    cleaned = text.strip()
    if not cleaned:
        return None, None
    match = re.match(r"^(\d+)\s*/\s*(\d+)$", cleaned)
    if match:
        heat = int(match.group(1))
        lane = int(match.group(2))
        # SwimPhone uses 0/0 for NS/DNS — no assignment. Lane 0 alone can be valid.
        if heat < 1 and lane < 1:
            return None, None
        if heat < 1:
            return None, lane
        return heat, lane
    return None, None


def _round_heat_lane_indices(headers: list[str]) -> tuple[int | None, int | None, int | None]:
    """Return (prelim_htln_idx, final_htln_idx, generic_htln_idx)."""
    prelim_idx: int | None = None
    final_idx: int | None = None
    generic_idx: int | None = None
    for i, h in enumerate(headers):
        norm = _normalize_header(h)
        is_htln = norm in {"htln", "heatlane"} or ("ht" in norm and "ln" in norm)
        if not is_htln:
            continue
        if "prelim" in norm:
            prelim_idx = i
        elif "final" in norm:
            final_idx = i
        elif generic_idx is None:
            generic_idx = i
    return prelim_idx, final_idx, generic_idx


def _heat_lane_for_round(
    cells: list,
    tag: str,
    prelim_idx: int | None,
    final_idx: int | None,
    generic_idx: int | None,
) -> tuple[int | None, int | None]:
    idx: int | None = None
    if tag == "P":
        idx = prelim_idx if prelim_idx is not None else generic_idx
    elif tag == "F":
        idx = final_idx if final_idx is not None else generic_idx
    else:
        idx = generic_idx or final_idx or prelim_idx
    if idx is None or idx >= len(cells):
        return None, None
    return parse_heat_lane_token(cells[idx].get_text(" ", strip=True))


def _rounds_from_cells(
    cells: list,
    prelim_idx: int | None,
    final_idx: int | None,
    time_indices: list[int],
    *,
    timed_finals: bool = False,
) -> list[dict[str, str]]:
    rounds: list[dict[str, str]] = []
    if timed_finals:
        if final_idx is not None:
            _append_result_round(rounds, cells, final_idx, "")
        elif prelim_idx is not None:
            _append_result_round(rounds, cells, prelim_idx, "")
        elif time_indices:
            for ti in time_indices:
                _append_result_round(rounds, cells, ti, "")
                if rounds:
                    break
        return rounds

    if prelim_idx is not None:
        _append_result_round(rounds, cells, prelim_idx, "P")
    if final_idx is not None:
        _append_result_round(rounds, cells, final_idx, "F")
    if not rounds:
        for ti in time_indices:
            _append_result_round(rounds, cells, ti, "")
            if rounds:
                break
    return rounds


def _max_heats_in_table(
    table,
    headers: list[str],
    swimmer_idx: int,
    prelim_idx: int | None,
    final_idx: int | None,
    time_indices: list[int],
    prelim_ht_idx: int | None,
    final_ht_idx: int | None,
    generic_ht_idx: int | None,
    sep_heat_idx: int | None,
    sep_lane_idx: int | None,
    session_tag: str,
    timed_finals: bool = False,
) -> dict[str, int]:
    """Max heat number per round tag — scanned on all swimmers before team filter."""
    max_by_tag: dict[str, int] = {}
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) <= swimmer_idx:
            continue
        if not cells[swimmer_idx].get_text(" ", strip=True):
            continue

        for round_time in _rounds_from_cells(
            cells, prelim_idx, final_idx, time_indices, timed_finals=timed_finals
        ):
            tags = round_time.get("tags", "") or session_tag
            if prelim_ht_idx is not None or final_ht_idx is not None or generic_ht_idx is not None:
                heat, _ = _heat_lane_for_round(
                    cells, tags, prelim_ht_idx, final_ht_idx, generic_ht_idx
                )
            else:
                heat, _ = _cell_heat_lane(cells, headers, sep_heat_idx, sep_lane_idx)
            if heat is not None and heat >= 1:
                max_by_tag[tags] = max(max_by_tag.get(tags, 0), heat)
    return max_by_tag


def apply_heat_totals(results: list[dict]) -> list[dict]:
    """Fill heatTotal from the highest heat seen per event + round."""
    max_by_key: dict[tuple[str, str], int] = {}
    for row in results:
        heat = row.get("heat")
        if heat is None or int(heat) < 1:
            continue
        tags = (row.get("tags") or "").strip().upper()
        round_key = "F" if tags == "F" else "P" if tags == "P" else tags
        key = (row["event"], round_key)
        max_by_key[key] = max(max_by_key.get(key, 0), int(heat))

    out: list[dict] = []
    for row in results:
        row = dict(row)
        heat = row.get("heat")
        if heat is not None and int(heat) >= 1 and row.get("heatTotal") is None:
            tags = (row.get("tags") or "").strip().upper()
            round_key = "F" if tags == "F" else "P" if tags == "P" else tags
            total = max_by_key.get((row["event"], round_key))
            if total is not None and total >= int(heat):
                row["heatTotal"] = total
        out.append(row)
    return out


def _cell_heat_lane(
    cells: list, headers: list[str], heat_idx: int | None, lane_idx: int | None
) -> tuple[int | None, int | None]:
    """Legacy helper for separate Heat + Lane columns (no HT/LN combo)."""
    if heat_idx is None:
        return None, None
    if lane_idx is not None and lane_idx < len(cells):
        heat_text = cells[heat_idx].get_text(" ", strip=True)
        lane_text = cells[lane_idx].get_text(" ", strip=True)
        heat = int(heat_text) if heat_text.isdigit() else None
        lane = int(lane_text) if lane_text.isdigit() else None
        if heat is not None and heat < 1:
            heat = None
        return heat, lane
    if heat_idx < len(cells):
        return parse_heat_lane_token(cells[heat_idx].get_text(" ", strip=True))
    return None, None


def _with_session(results_url: str, session: str) -> str:
    """Return event results URL scoped to prelims or finals."""
    parsed = urlparse(results_url)
    qs = parse_qs(parsed.query, keep_blank_values=True)
    qs["s"] = [session]
    query = urlencode(qs, doseq=True)
    return parsed._replace(query=query).geturl()


def _results_url_session(results_url: str | None) -> str | None:
    """Session embedded in the event-order results link, e.g. s=finals for timed finals."""
    if not results_url:
        return None
    raw = (parse_qs(urlparse(results_url).query).get("s") or [None])[0]
    if not raw:
        return None
    return str(raw).strip().lower()


def _event_html_has_round_time_columns(html: str) -> bool:
    """True when a results table has separate prelim/final time columns."""
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not headers or _swimmer_column_index(headers) is None:
            continue
        if any("prelim" in h and "time" in h for h in headers):
            return True
        if any("final" in h and "time" in h for h in headers):
            return True
    return False


def _results_table_headers(soup: BeautifulSoup, *, is_relay: bool) -> list[list[str]]:
    headers_list: list[list[str]] = []
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not headers:
            continue
        if is_relay:
            if "club" not in headers and "team" not in headers:
                continue
        elif _swimmer_column_index(headers) is None:
            continue
        headers_list.append(headers)
    return headers_list


def _header_has_round_marker(headers: list[str], round_name: str) -> bool:
    """True when a column is explicitly for prelims or finals (not a generic Time col)."""
    for h in headers:
        if round_name not in h:
            continue
        if any(k in h for k in ("time", "pl", "place", "ht", "ln", "seed")):
            return True
    return False


def _table_has_both_round_columns(headers: list[str]) -> bool:
    """True only when prelims and finals each have their own result columns."""
    if _header_has_round_marker(headers, "prelim") and _header_has_round_marker(
        headers, "final"
    ):
        return True
    if any("prelim" in h and "time" in h for h in headers) and any(
        "final" in h and "time" in h for h in headers
    ):
        return True
    prelim_pi, final_pi, _ = _result_place_indices(headers)
    if prelim_pi is not None and final_pi is not None:
        return True
    prelim_ht, final_ht, _ = _round_heat_lane_indices(headers)
    if prelim_ht is not None and final_ht is not None:
        return True
    return False


def _event_has_separate_round_results(html: str, *, is_relay: bool = False) -> bool:
    """True when an event has both prelims and finals columns (not timed finals)."""
    soup = BeautifulSoup(html, "html.parser")
    for headers in _results_table_headers(soup, is_relay=is_relay):
        if _table_has_both_round_columns(headers):
            return True
    return False


def _event_is_timed_finals(html: str, *, is_relay: bool = False) -> bool:
    """Timed finals — generic Time column, or only prelims-only / finals-only columns."""
    return not _event_has_separate_round_results(html, is_relay=is_relay)


def _sessions_to_scrape(html: str) -> list[str]:
    """Extra session pages when prelims/finals are split across sessions, not columns."""
    if _event_is_timed_finals(html, is_relay=False):
        return []
    if _event_has_separate_round_results(html, is_relay=False):
        return []
    return ["finals", "prelims"]


def _relay_split_sessions(
    html: str, results_url: str | None = None, *, is_relay: bool = True
) -> list[str]:
    if _event_is_timed_finals(html, is_relay=is_relay):
        url_session = _results_url_session(results_url)
        return [url_session or "finals"]
    return ["finals", "prelims"]


def _round_session_tag(session: str, *, timed_finals_event: bool = False) -> str:
    if timed_finals_event:
        return ""
    return "F" if session == "finals" else "P"


def _relay_entry_heat_lane(
    entry: dict[str, Any], session: str, *, timed_finals: bool
) -> tuple[int | None, int | None, int | None]:
    """Heat/lane for a relay splits fetch — generic columns land in prelim* on timed finals."""
    if timed_finals:
        heat = entry.get("prelimHeat") or entry.get("finalHeat")
        lane = (
            entry.get("prelimLane")
            if entry.get("prelimLane") is not None
            else entry.get("finalLane")
        )
        heat_total = entry.get("prelimHeatTotal") or entry.get("finalHeatTotal")
        return heat, lane, heat_total
    if session == "finals":
        return (
            entry.get("finalHeat"),
            entry.get("finalLane"),
            entry.get("finalHeatTotal"),
        )
    return (
        entry.get("prelimHeat"),
        entry.get("prelimLane"),
        entry.get("prelimHeatTotal"),
    )


def merge_swimphone_result_rows(base: list[dict], overlay: list[dict]) -> list[dict]:
    """Merge overlay rows (e.g. finals session) into base by name + event + tags."""
    by_key: dict[tuple[str, str, str], dict] = {}
    for row in base:
        key = (row["name"].lower(), row["event"], row.get("tags") or "")
        by_key[key] = dict(row)

    for row in overlay:
        key = (row["name"].lower(), row["event"], row.get("tags") or "")
        prev = by_key.get(key)
        if prev:
            if row.get("heat") is not None:
                prev["heat"] = row["heat"]
            if row.get("lane") is not None:
                prev["lane"] = row["lane"]
            if row.get("place") is not None and prev.get("place") is None:
                prev["place"] = row["place"]
        else:
            by_key[key] = dict(row)

    return list(by_key.values())


def parse_event_results_html(
    html: str,
    event: SwimPhoneEvent,
    team: str | None = None,
    session_tag: str = "",
    timed_finals: bool | None = None,
) -> list[dict]:
    if _is_captcha_page(html, ""):
        raise SwimPhoneCaptchaError(
            "SwimPhone requires email verification for this archived meet. "
            "Try importing while the meet is live, or use the PDF import instead."
        )

    soup = BeautifulSoup(html, "html.parser")
    if _is_captcha_page("", soup.get_text(" ", strip=True)):
        raise SwimPhoneCaptchaError(
            "SwimPhone requires email verification for this archived meet. "
            "Try importing while the meet is live, or use the PDF import instead."
        )

    header = soup.find(["h3", "h4"])
    event_label = event.label
    if header:
        header_text = header.get_text(" ", strip=True)
        parsed = re.search(
            r"Event\s+\d+:\s*(?:Women|Men|Mixed)\s+(\d+)\s*([YLM])?\s*(.+)",
            header_text,
            re.I,
        )
        if parsed:
            distance, code, stroke_raw = parsed.groups()
            _, course = _course_from_distance_token(
                f"{distance} {code or ''}".strip(), event.course
            )
            stroke = _normalize_stroke(stroke_raw) or event.stroke
            event_label = normalize_event(distance, stroke_raw) or f"{distance} {stroke}"
            event.course = course

    results: list[dict] = []
    team_norm = (team or "").strip().lower()
    if timed_finals is None:
        timed_finals = _event_is_timed_finals(html, is_relay=False)
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not headers:
            continue

        swimmer_idx = _swimmer_column_index(headers)
        if swimmer_idx is None:
            continue

        club_idx = _club_column_index(headers)
        prelim_ht_idx, final_ht_idx, generic_ht_idx = _round_heat_lane_indices(headers)
        # Separate Heat + Lane columns (no HT/LN combo header).
        sep_heat_idx = next(
            (i for i, h in enumerate(headers) if _normalize_header(h) == "heat"),
            None,
        )
        sep_lane_idx = next(
            (i for i, h in enumerate(headers) if _normalize_header(h) in {"lane", "ln"}),
            None,
        )

        prelim_place_idx, final_place_idx, generic_place_idx = _result_place_indices(
            headers
        )
        prelim_idx = next(
            (i for i, h in enumerate(headers) if "prelim" in h and "time" in h),
            None,
        )
        final_idx = next(
            (i for i, h in enumerate(headers) if "final" in h and "time" in h),
            None,
        )
        time_indices = _result_time_indices(headers)
        seed_idx = _seed_time_index(headers)
        if prelim_idx is None and final_idx is None and not time_indices:
            continue

        max_heats = _max_heats_in_table(
            table,
            headers,
            swimmer_idx,
            prelim_idx,
            final_idx,
            time_indices,
            prelim_ht_idx,
            final_ht_idx,
            generic_ht_idx,
            sep_heat_idx,
            sep_lane_idx,
            session_tag,
            timed_finals,
        )

        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= swimmer_idx:
                continue

            name = cells[swimmer_idx].get_text(" ", strip=True)
            if not name:
                continue

            if team_norm and club_idx is not None and club_idx < len(cells):
                club = cells[club_idx].get_text(strip=True)
                if not _club_matches(club, team_norm):
                    continue

            seed_time = _parse_seed_from_cells(cells, seed_idx)
            rounds = _rounds_from_cells(
                cells, prelim_idx, final_idx, time_indices, timed_finals=timed_finals
            )
            if not rounds:
                continue

            for round_time in rounds:
                tags = round_time.get("tags", "") or session_tag
                if prelim_ht_idx is not None or final_ht_idx is not None or generic_ht_idx is not None:
                    heat, lane = _heat_lane_for_round(
                        cells, tags, prelim_ht_idx, final_ht_idx, generic_ht_idx
                    )
                else:
                    heat, lane = _cell_heat_lane(cells, headers, sep_heat_idx, sep_lane_idx)

                place = _place_for_round(
                    cells,
                    tags,
                    prelim_place_idx,
                    final_place_idx,
                    generic_place_idx,
                )
                row: dict[str, Any] = {
                    "name": name,
                    "event": event_label,
                    "time": round_time.get("time") or round_time.get("status", ""),
                    "course": event.course,
                    "tags": tags,
                    "place": place,
                }
                if heat is not None and heat >= 1:
                    row["heat"] = heat
                    total = max_heats.get(tags)
                    if total is not None and total >= heat:
                        row["heatTotal"] = total
                if lane is not None:
                    row["lane"] = lane
                if seed_time:
                    row["seedTime"] = seed_time
                results.append(row)

    return apply_heat_totals(results)


def parse_relay_split_rids(html: str) -> list[str]:
    """Extract each relay's split-page id (rid) from an event results page."""
    soup = BeautifulSoup(html, "html.parser")
    rids: list[str] = []
    seen: set[str] = set()
    for link in soup.select('a[href*="splits.cfm"]'):
        href = link.get("href", "")
        match = re.search(r"[?&]rid=(\d+)", href)
        if match and match.group(1) not in seen:
            seen.add(match.group(1))
            rids.append(match.group(1))
    return rids


def _club_matches(club: str, team_norm: str) -> bool:
    """True if a results-row club code matches the requested team.

    Tolerates region suffixes so "GTSC" matches "GTSC-GA" and vice versa."""
    club_norm = club.strip().lower()
    if not team_norm:
        return True
    if club_norm == team_norm:
        return True
    return club_norm.split("-")[0] == team_norm.split("-")[0]


def _place_from_cell(cells: list, idx: int | None) -> int | None:
    if idx is None or idx >= len(cells):
        return None
    return parse_place_token(cells[idx].get_text(" ", strip=True))


def parse_team_relay_split_rids(html: str, team: str | None) -> list[dict[str, Any]]:
    """Return relay splits-page ids with finish place, optionally filtered to one club."""
    team_norm = (team or "").strip().lower()
    if not team_norm:
        return [{"rid": rid, "place": None} for rid in parse_relay_split_rids(html)]

    soup = BeautifulSoup(html, "html.parser")
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if "club" not in headers and "team" not in headers:
            continue
        club_i = headers.index("club") if "club" in headers else headers.index("team")
        prelim_pi, final_pi, generic_pi = _result_place_indices(headers)
        seed_idx = _seed_time_index(headers)
        name_i = headers.index("name") if "name" in headers else None
        prelim_ht_idx, final_ht_idx, generic_ht_idx = _round_heat_lane_indices(headers)
        sep_heat_idx = next(
            (i for i, h in enumerate(headers) if _normalize_header(h) == "heat"),
            None,
        )
        sep_lane_idx = next(
            (i for i, h in enumerate(headers) if _normalize_header(h) in {"lane", "ln"}),
            None,
        )

        max_prelim_heat = 0
        max_final_heat = 0
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= club_i or not cells[club_i].get_text(strip=True):
                continue
            if prelim_ht_idx is not None or final_ht_idx is not None or generic_ht_idx is not None:
                prelim_heat, _ = _heat_lane_for_round(
                    cells, "P", prelim_ht_idx, final_ht_idx, generic_ht_idx
                )
                final_heat, _ = _heat_lane_for_round(
                    cells, "F", prelim_ht_idx, final_ht_idx, generic_ht_idx
                )
            else:
                prelim_heat, _ = _cell_heat_lane(cells, headers, sep_heat_idx, sep_lane_idx)
                final_heat = None
            if prelim_heat is not None and prelim_heat >= 1:
                max_prelim_heat = max(max_prelim_heat, prelim_heat)
            if final_heat is not None and final_heat >= 1:
                max_final_heat = max(max_final_heat, final_heat)

        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= club_i:
                continue
            if not _club_matches(cells[club_i].get_text(strip=True), team_norm):
                continue
            prelim_place = _place_from_cell(cells, prelim_pi)
            final_place = _place_from_cell(cells, final_pi)
            generic_place = _place_from_cell(cells, generic_pi)
            place = (
                generic_place
                if generic_place is not None
                else final_place
                if final_place is not None
                else prelim_place
            )
            relay_letter = None
            if name_i is not None and name_i < len(cells):
                token = cells[name_i].get_text(strip=True).upper()
                if len(token) == 1 and token.isalpha():
                    relay_letter = token
            if prelim_ht_idx is not None or final_ht_idx is not None or generic_ht_idx is not None:
                prelim_heat, prelim_lane = _heat_lane_for_round(
                    cells, "P", prelim_ht_idx, final_ht_idx, generic_ht_idx
                )
                final_heat, final_lane = _heat_lane_for_round(
                    cells, "F", prelim_ht_idx, final_ht_idx, generic_ht_idx
                )
            else:
                prelim_heat, prelim_lane = _cell_heat_lane(
                    cells, headers, sep_heat_idx, sep_lane_idx
                )
                final_heat, final_lane = None, None
            for link in row.select('a[href*="splits.cfm"]'):
                match = re.search(r"[?&]rid=(\d+)", link.get("href", ""))
                if match and match.group(1) not in seen:
                    seen.add(match.group(1))
                    item: dict[str, Any] = {
                        "rid": match.group(1),
                        "place": place,
                        "prelimPlace": prelim_place,
                        "finalPlace": final_place,
                        "relayLetter": normalize_relay_letter(relay_letter),
                    }
                    if prelim_heat is not None and prelim_heat >= 1:
                        item["prelimHeat"] = prelim_heat
                        if max_prelim_heat >= prelim_heat:
                            item["prelimHeatTotal"] = max_prelim_heat
                    if prelim_lane is not None:
                        item["prelimLane"] = prelim_lane
                    if final_heat is not None and final_heat >= 1:
                        item["finalHeat"] = final_heat
                        if max_final_heat >= final_heat:
                            item["finalHeatTotal"] = max_final_heat
                    if final_lane is not None:
                        item["finalLane"] = final_lane
                    seed_time = _parse_seed_from_cells(cells, seed_idx)
                    if seed_time:
                        item["seedTime"] = seed_time
                    entries.append(item)
    return entries


def _relay_leadoff_stroke_default(event_label: str) -> str | None:
    """Leadoff stroke implied by the relay type (medley → Back, free → Free)."""
    low = event_label.lower()
    if "medley" in low:
        return "Back"
    if "free" in low:
        return "Free"
    return None


def _parse_leadoff_swimmer(soup: BeautifulSoup) -> tuple[str, str, str | None] | None:
    """Position-1 (leadoff) swimmer as (first, last, stroke) from a splits page."""
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if "position" not in headers or "last name" not in headers:
            continue
        pos_i = headers.index("position")
        first_i = headers.index("first name")
        last_i = headers.index("last name")
        stroke_i = headers.index("stroke") if "stroke" in headers else None
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= max(pos_i, first_i, last_i):
                continue
            if cells[pos_i].get_text(strip=True) != "1":
                continue
            first = cells[first_i].get_text(strip=True)
            last = cells[last_i].get_text(strip=True)
            stroke = None
            if stroke_i is not None and stroke_i < len(cells):
                stroke = cells[stroke_i].get_text(strip=True)
            if first and last:
                return first, last, stroke
        break
    return None


def _parse_cum_splits(soup: BeautifulSoup) -> dict[int, str]:
    """Map of distance -> cumulative split text from a relay splits page."""
    splits_table = soup.find("table", id="splitsTable")
    if splits_table is None:
        for table in soup.find_all("table"):
            headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
            if "distance" in headers and "cum" in headers:
                splits_table = table
                break
    if splits_table is None:
        return {}

    headers = [th.get_text(strip=True).lower() for th in splits_table.find_all("th")]
    dist_i = headers.index("distance")
    cum_i = headers.index("cum")

    dist_to_cum: dict[int, str] = {}
    for row in splits_table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) <= max(dist_i, cum_i):
            continue
        dist_text = cells[dist_i].get_text(strip=True)
        cum_text = cells[cum_i].get_text(strip=True)
        if dist_text.isdigit():
            parsed = parse_time_token(cum_text)
            if parsed:
                dist_to_cum[int(dist_text)] = parsed
    return dist_to_cum


def _parse_relay_swimmers(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """All four relay legs from a splits page roster table."""
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if "position" not in headers or "last name" not in headers:
            continue
        pos_i = headers.index("position")
        first_i = headers.index("first name")
        last_i = headers.index("last name")
        swimmers: list[dict[str, Any]] = []
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= max(pos_i, first_i, last_i):
                continue
            pos_text = cells[pos_i].get_text(strip=True)
            if not pos_text.isdigit():
                continue
            first = cells[first_i].get_text(strip=True)
            last = cells[last_i].get_text(strip=True)
            if first and last:
                swimmers.append(
                    {"leg": int(pos_text), "name": f"{last}, {first}"}
                )
        swimmers.sort(key=lambda s: s["leg"])
        if swimmers:
            return swimmers
    return []


def _parse_relay_finish_time(soup: BeautifulSoup) -> str | None:
    dist_to_cum = _parse_cum_splits(soup)
    if not dist_to_cum:
        return None
    total = max(dist_to_cum)
    return parse_time_token(dist_to_cum.get(total, ""))


def _relay_total_distance(event_label: str) -> int | None:
    match = re.match(r"(\d+)", event_label.strip())
    return int(match.group(1)) if match else None


def _leg_split_times(soup: BeautifulSoup, total_distance: int) -> dict[int, str]:
    """Individual leg time for each relay swimmer (not cumulative)."""
    dist_to_cum = _parse_cum_splits(soup)
    if not dist_to_cum:
        return {}
    leg_distance = total_distance // 4
    cumulative: list[str] = []
    for leg in range(1, 5):
        dist = leg * leg_distance
        cum = dist_to_cum.get(dist)
        if not cum:
            break
        cumulative.append(cum)
    return leg_times_from_cumulative(cumulative)


def parse_relay_result(
    html: str,
    *,
    course: str,
    event_label: str,
    tags: str = "",
    place: int | None = None,
    relay_letter: str | None = None,
    gender: str = "",
    heat: int | None = None,
    lane: int | None = None,
    heat_total: int | None = None,
    seed_time: str | None = None,
) -> dict | None:
    """Relay team result from a splits page — roster optional if finish time exists."""
    soup = BeautifulSoup(html, "html.parser")
    finish = _parse_relay_finish_time(soup)
    if not finish:
        return None
    swimmers = _parse_relay_swimmers(soup)
    total = _relay_total_distance(event_label)
    leg_splits = _leg_split_times(soup, total) if total else {}
    by_leg = {s["leg"]: dict(s) for s in swimmers}
    for leg in range(1, 5):
        split = leg_splits.get(leg)
        if leg in by_leg:
            if split:
                by_leg[leg]["splitTime"] = split
        elif split:
            by_leg[leg] = {"leg": leg, "name": "", "splitTime": split}
    swimmers = [by_leg[k] for k in sorted(by_leg)]
    event = re.sub(r"\s+", " ", event_label.strip())
    gender_code = ""
    g = gender.strip().lower()
    if g in {"women", "girl", "female", "f"}:
        gender_code = "F"
    elif g in {"men", "boy", "male", "m"}:
        gender_code = "M"
    elif g in {"mixed", "x", "co-ed", "coed"}:
        gender_code = "X"
    result: dict[str, Any] = {
        "entryType": "relay_team",
        "event": event,
        "relayLetter": normalize_relay_letter(relay_letter),
        "gender": gender_code,
        "relaySwimmers": swimmers,
        "time": finish,
        "course": course,
        "tags": tags,
        "place": place,
    }
    if heat is not None and heat >= 1:
        result["heat"] = heat
    if lane is not None:
        result["lane"] = lane
    if heat_total is not None and heat is not None and heat >= 1:
        result["heatTotal"] = heat_total
    if seed_time:
        result["seedTime"] = seed_time
    return result


def parse_relay_leadoff(html: str, course: str, event_label: str = "") -> dict | None:
    """Leadoff swim from a SINGLE session's splits page.

    Only the leadoff leg is an official individual time: the Position-1 swimmer,
    timed at the cumulative split at total distance / 4. The page must carry both
    the relay roster (Position table) and the leadoff split on its own — we never
    borrow the lineup from another session, since the relay roster/order can
    change between prelims and finals."""
    soup = BeautifulSoup(html, "html.parser")

    swimmer = _parse_leadoff_swimmer(soup)
    if not swimmer:
        return None

    dist_to_cum = _parse_cum_splits(soup)
    if not dist_to_cum:
        return None

    total = max(dist_to_cum)
    leg = total // 4
    time_val = parse_time_token(dist_to_cum.get(leg, ""))
    if not time_val:
        return None

    stroke = STROKE_FROM_SPLIT.get((swimmer[2] or "").lower())
    if not stroke:
        stroke = _relay_leadoff_stroke_default(event_label)
    if not stroke:
        return None

    first, last, _ = swimmer
    return {
        "name": f"{last}, {first}",
        "event": f"{leg} {stroke}",
        "time": time_val,
        "course": course,
        "tags": "R",
    }


async def _fetch_page_html(page, url: str) -> str:
    response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    if response and response.status == 403:
        raise SwimPhoneAccessError(
            "SwimPhone blocked this request (403). Open Run scraper in the app, "
            "run it on your computer, then try the import again."
        )
    if response and response.status >= 400:
        raise SwimPhoneParseError(f"SwimPhone returned HTTP {response.status} for {url}")
    return await page.content()


async def scrape_swimphone_meet(url: str, team: str | None = None) -> dict:
    smid = extract_smid(url)
    meet_menu_url = f"{BASE_URL}{MEET_MENU_PATH}?smid={smid}"
    event_order_url = f"{BASE_URL}{EVENT_ORDER_PATH}?smid={smid}"

    all_results: list[dict] = []
    all_relay_results: list[dict] = []
    incomplete_relays: list[str] = []
    captcha = False
    events_with_results: list[SwimPhoneEvent] = []
    meet_name = ""
    meet_date: str | None = None
    meet_default = "SCY"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=_playwright_headless(),
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=BROWSER_UA,
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()

        menu_html = await _fetch_page_html(page, meet_menu_url)
        order_html = await _fetch_page_html(page, event_order_url)

        meet_name, meet_date, meet_default = parse_meet_metadata(menu_html)
        if not meet_name:
            order_name, order_date, order_default = parse_meet_metadata(order_html)
            meet_name = order_name
            meet_date = meet_date or order_date
            meet_default = meet_default or order_default

        events = parse_event_order(order_html, smid, meet_default)

        # The event order page carries the most reliable dates; use its earliest
        # session day as the meet date when the menu metadata didn't yield one.
        if not meet_date:
            event_dates = [e.date for e in events if e.date]
            if event_dates:
                meet_date = min(event_dates)

        events_with_results = [e for e in events if e.results_url]
        if not events_with_results:
            await browser.close()
            raise SwimPhoneParseError("No event results are posted for this meet yet.")

        for idx, event in enumerate(events_with_results):
            assert event.results_url
            await page.goto(event.results_url, wait_until="domcontentloaded", timeout=60000)
            title = await page.title()
            html = await page.content()

            if _is_captcha_page(html, title):
                captcha = True
                break

            if event.is_relay:
                relay_entries = parse_team_relay_split_rids(html, team)
                relay_result_found = False
                timed_finals_event = _event_is_timed_finals(html, is_relay=True)
                relay_sessions = _relay_split_sessions(
                    html, event.results_url, is_relay=True
                )
                for entry in relay_entries:
                    rid = entry["rid"]
                    relay_letter = entry.get("relayLetter")
                    entry_found = False
                    for sess in relay_sessions:
                        tag = _round_session_tag(sess, timed_finals_event=timed_finals_event)
                        relay_place = (
                            entry.get("finalPlace")
                            if sess == "finals"
                            else entry.get("prelimPlace")
                        )
                        if relay_place is None:
                            relay_place = entry.get("place")
                        relay_heat, relay_lane, relay_heat_total = _relay_entry_heat_lane(
                            entry, sess, timed_finals=timed_finals_event
                        )
                        splits_url = f"{BASE_URL}splits.cfm?smid={smid}&rid={rid}&s={sess}"
                        try:
                            await page.goto(
                                splits_url, wait_until="domcontentloaded", timeout=60000
                            )
                            splits_html = await page.content()
                            relay_full = parse_relay_result(
                                splits_html,
                                course=event.course,
                                event_label=event.label,
                                tags=tag,
                                place=relay_place,
                                relay_letter=relay_letter,
                                gender=event.gender,
                                heat=relay_heat,
                                lane=relay_lane,
                                heat_total=relay_heat_total,
                                seed_time=entry.get("seedTime"),
                            )
                        except Exception:
                            relay_full = None
                        await asyncio.sleep(0.2)
                        if relay_full:
                            if event.date:
                                relay_full["date"] = event.date
                            all_relay_results.append(relay_full)
                            entry_found = True
                    if entry_found:
                        relay_result_found = True
                if relay_entries and not relay_result_found:
                    label = f"{event.gender} {event.label}".strip()
                    if label not in incomplete_relays:
                        incomplete_relays.append(label)
            else:
                timed_finals_event = _event_is_timed_finals(html, is_relay=False)
                rows = parse_event_results_html(
                    html, event, team=team, timed_finals=timed_finals_event
                )
                for sess in _sessions_to_scrape(html):
                    sess_tag = _round_session_tag(
                        sess, timed_finals_event=timed_finals_event
                    )
                    try:
                        sess_url = _with_session(event.results_url, sess)
                        await page.goto(
                            sess_url, wait_until="domcontentloaded", timeout=60000
                        )
                        sess_html = await page.content()
                        sess_rows = parse_event_results_html(
                            sess_html,
                            event,
                            team=team,
                            session_tag=sess_tag,
                            timed_finals=timed_finals_event,
                        )
                        rows = merge_swimphone_result_rows(rows, sess_rows)
                    except Exception:
                        pass
                    await asyncio.sleep(0.2)
                rows = apply_heat_totals(rows)
                if event.date:
                    for r in rows:
                        r["date"] = event.date
                all_results.extend(rows)

            if idx + 1 < len(events_with_results):
                await asyncio.sleep(0.35)

        await browser.close()

    if captcha and not all_results:
        raise SwimPhoneCaptchaError(
            "SwimPhone blocked access to this archived meet (email + reCAPTCHA required). "
            "Import during the meet or shortly after, or use PDF import."
        )

    if not all_results and not all_relay_results:
        raise SwimPhoneParseError("No swim times found in posted results.")

    # Dedupe within scrape
    seen: set[tuple[str, str, str, str]] = set()
    deduped: list[dict] = []
    for row in all_results:
        key = (row["name"], row["event"], row["time"], row.get("tags") or "")
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)

    relay_seen: set[tuple[str, tuple[str, ...], str, str, str, str]] = set()
    deduped_relays: list[dict] = []
    for row in all_relay_results:
        names = tuple(s["name"] for s in row.get("relaySwimmers", []))
        key = (
            row["event"],
            names,
            row["time"],
            row.get("tags") or "",
            row.get("relayLetter") or "",
            row.get("gender") or "",
        )
        if key in relay_seen:
            continue
        relay_seen.add(key)
        deduped_relays.append(row)

    course_counts: dict[str, int] = {}
    for row in deduped:
        course_counts[row["course"]] = course_counts.get(row["course"], 0) + 1
    default_course = max(course_counts, key=course_counts.get) if course_counts else meet_default

    return {
        "meet_name": meet_name,
        "meet_date": meet_date,
        "course": default_course,
        "results": deduped,
        "relay_results": deduped_relays,
        "events_scraped": len(events_with_results) if not captcha else None,
        "captcha_limited": captcha,
        "incomplete_relays": incomplete_relays,
    }
