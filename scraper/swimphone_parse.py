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

    long = re.search(
        r"\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
        r"([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b",
        text,
    )
    if long:
        try:
            dt = datetime.strptime(
                f"{long.group(1)} {long.group(2)} {long.group(3)}", "%B %d %Y"
            )
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

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


def parse_event_order(html: str, smid: int, meet_default: str) -> list[SwimPhoneEvent]:
    soup = BeautifulSoup(html, "html.parser")
    events: list[SwimPhoneEvent] = []

    for row in soup.select("table tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        event_num_text = cells[0].get_text(strip=True)
        if not event_num_text.isdigit():
            continue

        gender = cells[1].get_text(strip=True)
        distance_raw = cells[2].get_text(" ", strip=True)
        stroke_raw = cells[3].get_text(" ", strip=True)
        stroke = _normalize_stroke(stroke_raw)
        if not stroke:
            continue

        distance, course = _course_from_distance_token(distance_raw, meet_default)
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
        if not headers or "swimmer" not in headers:
            continue

        swimmer_idx = headers.index("swimmer")
        time_idx = None
        for candidate in ("time", "finals", "prelim"):
            if candidate in headers:
                time_idx = headers.index(candidate)
                break
        if time_idx is None:
            continue

        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) <= max(swimmer_idx, time_idx):
                continue

            name = cells[swimmer_idx].get_text(" ", strip=True)
            time_raw = cells[time_idx].get_text(" ", strip=True)
            if not name or not time_raw:
                continue

            time_val = parse_time_token(time_raw)
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


async def _fetch_html(client: httpx.AsyncClient, url: str) -> str:
    response = await client.get(url)
    response.raise_for_status()
    return response.text


async def scrape_swimphone_meet(url: str) -> dict:
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
    events_with_results = [e for e in events if e.results_url]
    if not events_with_results:
        raise SwimPhoneParseError("No event results are posted for this meet yet.")

    all_results: list[dict] = []
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

            parsed = parse_event_results_html(html, event)
            all_results.extend(parsed)

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
    }
