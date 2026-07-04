"""Scrape meet results from SwimPhone event pages."""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from pdf_parse import INVALID_TIMES, normalize_event, parse_time_token

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
                label = f"{distance} {stroke_raw}".strip()
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


def parse_event_results_html(html: str, event: SwimPhoneEvent) -> list[dict]:
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
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not headers:
            continue

        swimmer_idx = _swimmer_column_index(headers)
        if swimmer_idx is None:
            continue

        # Prelims/finals meets label columns "PrelimsTime"/"FinalsTime" rather
        # than a bare "Time", so match by substring and prefer the finals swim,
        # falling back to prelims (and never the seed time).
        time_indices = _result_time_indices(headers)
        if not time_indices:
            continue

        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= swimmer_idx:
                continue

            name = cells[swimmer_idx].get_text(" ", strip=True)
            if not name:
                continue

            time_val = None
            for ti in time_indices:
                if ti < len(cells):
                    parsed = parse_time_token(cells[ti].get_text(" ", strip=True))
                    if parsed:
                        time_val = parsed
                        break
            if not time_val:
                continue

            results.append(
                {
                    "name": name,
                    "event": event_label,
                    "time": time_val,
                    "course": event.course,
                }
            )

    return results


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


def parse_team_relay_split_rids(html: str, team: str | None) -> list[str]:
    """Return relay splits-page ids (rid), optionally filtered to one club.

    A relay results page lists every team's relay entry, each with its own
    per-relay splits link. Visiting all of them is very slow for large meets
    (many events x many teams), so when a team code is supplied we only return
    that club's relays — which is all we can import leadoffs for anyway."""
    team_norm = (team or "").strip().lower()
    if not team_norm:
        return parse_relay_split_rids(html)

    soup = BeautifulSoup(html, "html.parser")
    rids: list[str] = []
    seen: set[str] = set()
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if "club" not in headers:
            continue
        club_i = headers.index("club")
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= club_i:
                continue
            if not _club_matches(cells[club_i].get_text(strip=True), team_norm):
                continue
            for link in row.select('a[href*="splits.cfm"]'):
                match = re.search(r"[?&]rid=(\d+)", link.get("href", ""))
                if match and match.group(1) not in seen:
                    seen.add(match.group(1))
                    rids.append(match.group(1))
    return rids


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
            dist_to_cum[int(dist_text)] = cum_text
    return dist_to_cum


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


async def _fetch_html(client: httpx.AsyncClient, url: str) -> str:
    response = await client.get(url)
    response.raise_for_status()
    return response.text


async def scrape_swimphone_meet(url: str, team: str | None = None) -> dict:
    smid = extract_smid(url)
    meet_menu_url = f"{BASE_URL}{MEET_MENU_PATH}?smid={smid}"
    event_order_url = f"{BASE_URL}{EVENT_ORDER_PATH}?smid={smid}"

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(60.0),
        headers={"User-Agent": "Mozilla/5.0 (compatible; SwimBuzz/1.0)"},
    ) as client:
        menu_html = await _fetch_html(client, meet_menu_url)
        order_html = await _fetch_html(client, event_order_url)

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
        raise SwimPhoneParseError("No event results are posted for this meet yet.")

    all_results: list[dict] = []
    incomplete_relays: list[str] = []
    captcha = False

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()
        await page.goto(event_order_url, wait_until="domcontentloaded", timeout=60000)

        for idx, event in enumerate(events_with_results):
            assert event.results_url
            await page.goto(event.results_url, wait_until="domcontentloaded", timeout=60000)
            title = await page.title()
            html = await page.content()

            if _is_captcha_page(html, title):
                captcha = True
                break

            if event.is_relay:
                # Relay leadoffs are official individual times, but they live on
                # per-relay splits pages linked from the results page. Only fetch
                # the requested team's relays — otherwise large meets (many teams
                # x many relays) spawn hundreds of page loads and never finish.
                relay_rids = parse_team_relay_split_rids(html, team)
                relay_leadoff_found = False
                for rid in relay_rids:
                    # Try each session's own splits page (finals first) and take
                    # the first one that has a relay roster + leadoff split. We
                    # never combine sessions, since the lineup/order can differ
                    # between prelims and finals.
                    leadoff = None
                    for sess in ("finals", "prelims"):
                        splits_url = f"{BASE_URL}splits.cfm?smid={smid}&rid={rid}&s={sess}"
                        try:
                            await page.goto(splits_url, wait_until="domcontentloaded", timeout=60000)
                            leadoff = parse_relay_leadoff(
                                await page.content(), event.course, event.label
                            )
                        except Exception:
                            leadoff = None
                        await asyncio.sleep(0.2)
                        if leadoff:
                            break
                    if leadoff:
                        if event.date:
                            leadoff["date"] = event.date
                        all_results.append(leadoff)
                        relay_leadoff_found = True
                # The team entered this relay but no session had a complete
                # roster + leadoff split, so its leadoff couldn't be imported.
                if relay_rids and not relay_leadoff_found:
                    label = f"{event.gender} {event.label}".strip()
                    if label not in incomplete_relays:
                        incomplete_relays.append(label)
            else:
                rows = parse_event_results_html(html, event)
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

    if not all_results:
        raise SwimPhoneParseError("No swim times found in posted results.")

    # Dedupe within scrape
    seen: set[tuple[str, str, str]] = set()
    deduped: list[dict] = []
    for row in all_results:
        key = (row["name"], row["event"], row["time"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)

    course_counts: dict[str, int] = {}
    for row in deduped:
        course_counts[row["course"]] = course_counts.get(row["course"], 0) + 1
    default_course = max(course_counts, key=course_counts.get) if course_counts else meet_default

    return {
        "meet_name": meet_name,
        "meet_date": meet_date,
        "course": default_course,
        "results": deduped,
        "events_scraped": len(events_with_results) if not captcha else None,
        "captcha_limited": captcha,
        "incomplete_relays": incomplete_relays,
    }
