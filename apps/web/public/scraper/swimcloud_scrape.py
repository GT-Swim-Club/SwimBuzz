"""SwimCloud browser scraping used by the Run scraper scraper."""

from __future__ import annotations

import asyncio
import os
import random
import re
import subprocess
import sys
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

load_dotenv(Path(__file__).resolve().parent / ".env")


class SwimCloudScrapeError(Exception):
    """Raised when SwimCloud cannot be scraped (Cloudflare, timeout, etc.)."""


# Live progress for the app's import toast. scraper.py installs a reporter per job;
# fields merge so callers only send what changed (e.g. {"cloudflare": True}).
_progress_reporter = None
_progress: dict = {}


def set_progress_reporter(reporter) -> None:
    global _progress_reporter, _progress
    _progress_reporter = reporter
    _progress = {}


# Async callback(swimmer_id, result) that hands a finished swimmer's meets to the app right away;
# result is None when the swimmer failed. Returns True once the app has saved them.
_times_sink = None


def set_times_sink(sink) -> None:
    global _times_sink
    _times_sink = sink


def report_progress(**fields) -> None:
    if _progress_reporter is None:
        return
    if all(_progress.get(k) == v for k, v in fields.items()):
        return
    _progress.update(fields)
    _progress_reporter(dict(_progress))


def _frontmost_app_path() -> str:
    """Path of the app that has OS focus right now, or "" when it can't be told."""
    if sys.platform == "darwin":
        run = lambda *cmd: subprocess.run(cmd, capture_output=True, text=True, timeout=2).stdout
        match = re.search(r'bundle path="([^"]*)"', run("lsappinfo", "info", "-only", "bundlepath", run("lsappinfo", "front").strip()))
        return match.group(1) if match else ""
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
        kernel32.OpenProcess.restype = wintypes.HANDLE
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), ctypes.byref(pid))
        handle = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ""
        buf, size = ctypes.create_unicode_buffer(1024), wintypes.DWORD(1024)
        kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size))
        kernel32.CloseHandle(handle)
        return buf.value
    return ""


def browser_is_frontmost() -> bool:
    """Whether the scraper's own Playwright browser has OS focus, i.e. the user is already looking at it.

    Playwright fakes page focus (document.hasFocus() is always true), so ask the OS instead.
    Reports False when it can't tell, so the app errs toward alerting.
    """
    try:
        path = _frontmost_app_path().lower()
    except Exception:
        return False
    browsers_dir = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "")
    return "ms-playwright" in path or (browsers_dir not in ("", "0") and browsers_dir.lower() in path)


def playwright_headless() -> bool:
    return os.environ.get("PLAYWRIGHT_HEADLESS", "true").lower() not in ("0", "false", "no")


PLAYWRIGHT_HEADLESS = playwright_headless()
BROWSER_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
]
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
BROWSER_VIEWPORT = {"width": 1280, "height": 800}

MIN_DELAY_SEC = 1.2
MAX_DELAY_SEC = 8.0
INITIAL_DELAY_SEC = 1.5
MAX_RETRIES = 6
RETRY_BASE_SEC = 12
BULK_SWIMMER_GAP_SEC = 5.0
BULK_INITIAL_DELAY_SEC = 2.0
# A swimmer that errors gets one more go after this long, since blocks and rate limits tend to pass.
BULK_RETRY_COOLDOWN_SEC = 45.0

STROKE_MAP = {
    "Free": "1", "Back": "2", "Breast": "3", "Fly": "4", "IM": "5",
}
COURSE_MAP = {"SCY": "Y", "LCM": "L", "SCM": "S"}

EVENTS = [
    ("Free", "50", "SCY"), ("Free", "50", "LCM"),
    ("Free", "100", "SCY"), ("Free", "100", "LCM"),
    ("Free", "200", "SCY"), ("Free", "200", "LCM"),
    ("Free", "400", "SCY"), ("Free", "400", "LCM"),
    ("Free", "500", "SCY"),
    ("Free", "800", "LCM"),
    ("Free", "1000", "SCY"),
    ("Free", "1500", "LCM"),
    ("Free", "1650", "SCY"),
    ("Back", "50", "SCY"), ("Back", "50", "LCM"),
    ("Back", "100", "SCY"), ("Back", "100", "LCM"),
    ("Back", "200", "SCY"), ("Back", "200", "LCM"),
    ("Breast", "50", "SCY"), ("Breast", "50", "LCM"),
    ("Breast", "100", "SCY"), ("Breast", "100", "LCM"),
    ("Breast", "200", "SCY"), ("Breast", "200", "LCM"),
    ("Fly", "50", "SCY"), ("Fly", "50", "LCM"),
    ("Fly", "100", "SCY"), ("Fly", "100", "LCM"),
    ("Fly", "200", "SCY"), ("Fly", "200", "LCM"),
    ("IM", "100", "SCY"),
    ("IM", "200", "SCY"), ("IM", "200", "LCM"),
    ("IM", "400", "SCY"), ("IM", "400", "LCM"),
]

FETCH_JS = """
async (url) => {
    const res = await fetch(url, {
        headers: {
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
        },
    });
    if (!res.ok) return { error: res.status };
    return await res.json();
}
"""


class AdaptivePacer:
    def __init__(self):
        self.delay = INITIAL_DELAY_SEC

    async def wait(self):
        await asyncio.sleep(self.delay + random.uniform(0, 0.25))

    def on_success(self):
        self.delay = max(MIN_DELAY_SEC, self.delay * 0.85)

    def on_rate_limit(self):
        self.delay = min(MAX_DELAY_SEC, max(self.delay * 2.0, MIN_DELAY_SEC * 2))


def is_cloudflare_challenge(html: str, title: str = "") -> bool:
    title_l = title.lower()
    html_l = html.lower()
    return (
        "just a moment" in title_l
        or "attention required" in title_l
        or "cf-challenge" in html_l
        or "challenges.cloudflare.com" in html_l
    )


def is_transient_navigation_error(exc: BaseException) -> bool:
    """Playwright throws when content/title is read mid-navigation."""
    msg = str(exc).lower()
    return (
        "navigating and changing the content" in msg
        or "execution context was destroyed" in msg
        or "most likely because of a navigation" in msg
        or "frame was detached" in msg
    )


async def settle_page(page, timeout_ms: int = 15_000) -> None:
    """Wait for the document to stop thrashing after a goto/SPA redirect."""
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    except Exception:
        pass
    try:
        await page.wait_for_load_state("load", timeout=timeout_ms)
    except Exception:
        pass
    await asyncio.sleep(0.35)


async def safe_page_title(page, attempts: int = 8) -> str:
    last: BaseException | None = None
    for i in range(attempts):
        try:
            return await page.title()
        except Exception as e:
            last = e
            if not is_transient_navigation_error(e):
                raise
            await settle_page(page)
            await asyncio.sleep(0.4 + 0.2 * i)
    raise SwimCloudScrapeError(f"Could not read page title: {last}") from last


async def safe_page_content(page, attempts: int = 8) -> str:
    last: BaseException | None = None
    for i in range(attempts):
        try:
            return await page.content()
        except Exception as e:
            last = e
            if not is_transient_navigation_error(e):
                raise
            await settle_page(page)
            await asyncio.sleep(0.4 + 0.2 * i)
    raise SwimCloudScrapeError(f"Could not read page content: {last}") from last


async def wait_past_cloudflare(page, timeout_ms: int = 120_000) -> None:
    deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
    while asyncio.get_event_loop().time() < deadline:
        title = await safe_page_title(page)
        html = await safe_page_content(page)
        if not is_cloudflare_challenge(html, title):
            report_progress(cloudflare=False)
            return
        report_progress(cloudflare=True, browserFocused=browser_is_frontmost())
        await asyncio.sleep(2.5)

    html = await safe_page_content(page)
    title = await safe_page_title(page)
    if is_cloudflare_challenge(html, title):
        raise SwimCloudScrapeError(
            "Cloudflare blocked access to SwimCloud. Complete the check in the browser window."
        )
    raise SwimCloudScrapeError("Timed out waiting for SwimCloud to load.")


async def navigate_swimcloud(
    page,
    url: str,
    selector: str | None = None,
    selector_timeout: int = 45_000,
    via_home: bool = True,
) -> None:
    if via_home:
        await page.goto(
            "https://www.swimcloud.com/",
            wait_until="domcontentloaded",
            timeout=60_000,
        )
        await settle_page(page)
        await wait_past_cloudflare(page)
    await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    await settle_page(page)
    await wait_past_cloudflare(page)
    if not selector:
        return
    try:
        await page.wait_for_selector(selector, timeout=selector_timeout)
    except Exception as e:
        html = await safe_page_content(page)
        title = await safe_page_title(page)
        if is_cloudflare_challenge(html, title):
            raise SwimCloudScrapeError(
                "Cloudflare blocked access to SwimCloud. Complete the check in the browser window."
            ) from e
        raise


async def launch_browser(playwright):
    browser = await playwright.chromium.launch(
        headless=PLAYWRIGHT_HEADLESS,
        args=BROWSER_ARGS,
        ignore_default_args=["--enable-automation"],
    )
    context = await browser.new_context(
        user_agent=BROWSER_USER_AGENT,
        viewport=BROWSER_VIEWPORT,
        locale="en-US",
        timezone_id="America/New_York",
    )
    page = await context.new_page()
    stealth = Stealth()
    await stealth.apply_stealth_async(page)
    return browser, page


async def scrape_team_roster(team_id: int, year: int, gender: str = "M"):
    season_id = year - 1997
    results = []
    async with async_playwright() as p:
        browser, page = await launch_browser(p)
        try:
            await navigate_swimcloud(
                page,
                f"https://www.swimcloud.com/team/{team_id}/roster/?gender={gender}&season_id={season_id}",
                selector="table tbody tr",
            )
        except SwimCloudScrapeError:
            await browser.close()
            raise
        except Exception as e:
            try:
                html = await safe_page_content(page)
                title = await safe_page_title(page)
            except Exception:
                await browser.close()
                raise SwimCloudScrapeError(f"Failed to load roster: {e}") from e
            await browser.close()
            if is_cloudflare_challenge(html, title):
                raise SwimCloudScrapeError(
                    "Cloudflare blocked access to SwimCloud. Complete the check in the browser window."
                ) from e
            raise SwimCloudScrapeError(f"Failed to load roster: {e}") from e

        rows = await page.query_selector_all("table tbody tr")
        for row in rows:
            cols = await row.query_selector_all("td")
            if len(cols) < 2:
                continue
            try:
                name_el = await row.query_selector("a[href*='/swimmer/']")
                if not name_el:
                    continue
                name = (await name_el.inner_text()).strip()
                href = await name_el.get_attribute("href")
                swimmer_id = int(href.strip("/").split("/")[-1])
                parts = name.strip().split(" ")
                first = parts[0]
                last = " ".join(parts[1:]) if len(parts) > 1 else ""
                results.append({
                    "swimmer_name": name,
                    "swimmer_ID": str(swimmer_id),
                    "firstName": first,
                    "lastName": last,
                })
            except Exception:
                continue
        await browser.close()
    return results


def extract_tags(swim: dict) -> str:
    flags = swim.get("flags") or []
    labels = [
        label
        for f in flags
        if isinstance(f, dict) and (label := str(f.get("label", ""))) and len(label) == 1 and label.isalpha()
    ]
    return "".join(labels)


# Meets in the profile's "Latest Results" dropdown, as {meetId, lines} (newest first); `lines` is the
# entry's text, meet name first, then its date ("July 22, 2023").
SWIMMER_MEETS_JS = r"""
() => [...document.querySelectorAll('a[href*="/times/latest/"]')].map((a) => ({
    meetId: Number(new URL(a.href, location.href).searchParams.get("meet_id")),
    lines: [...a.querySelectorAll("div")].filter((d) => !d.children.length).map((d) => d.textContent.trim()).filter(Boolean),
})).filter((meet) => Number.isInteger(meet.meetId) && meet.meetId > 0)
"""

# One meet's results for the swimmer: the dropdown button's date range plus a row per swim.
MEET_ROWS_JS = r"""
async (url) => {
    const res = await fetch(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!res.ok) return { error: res.status };
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const toggle = doc.querySelector(".dropdown-toggle");
    // The button's text: meet name, then its dates ("Jul 22–23, 2023").
    const dateLines = toggle
        ? [...toggle.querySelectorAll("div")].filter((d) => !d.children.length).map((d) => d.textContent.trim()).filter(Boolean)
        : [];
    const rows = [...doc.querySelectorAll("table tbody tr")].map((tr) => {
        const cells = tr.querySelectorAll("td");
        const link = tr.querySelector('a[href*="/results/"]');
        const href = link ? link.getAttribute("href") : "";
        const eventNo = Number((href.match(/\/event\/(\d+)/) || [])[1]);
        // Place is the last column; some meets add a "Personal Season Best" column before it.
        const last = cells[cells.length - 1];
        const place = parseInt((last ? last.textContent : "").trim(), 10);
        const name = cells[0] && cells[0].querySelector("strong");
        const round = cells[0] && cells[0].querySelector("span");
        return {
            swimId: Number((href.match(/#time(\d+)/) || [])[1]),
            eventNo: eventNo > 0 ? eventNo : null,
            event: name ? name.textContent.trim().replace(/\s+/g, " ") : "",
            round: round ? round.textContent.trim() : "",
            time: link ? link.textContent.trim() : "",
            place: place > 0 ? place : null,
        };
    }).filter((row) => Number.isInteger(row.swimId) && row.swimId > 0 && row.event && row.time);
    return { dateLines, rows };
}
"""

# A relay event's teams as {timeId, leadoffId}: the team's time id (what each leg's meet row links to)
# and its lead-off, the first swimmer the team's row names.
EVENT_LEADOFFS_JS = r"""
async (url) => {
    const res = await fetch(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!res.ok) return { error: res.status };
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const teams = [];
    for (const tr of doc.querySelectorAll("table tbody tr")) {
        const ids = [...tr.querySelectorAll('[id^="time"]')].map((el) => el.id)
            .concat([...tr.querySelectorAll('a[href*="#time"]')].map((a) => a.getAttribute("href").split("#")[1]));
        const timeId = Number((ids.map((id) => /^time(\d+)$/.exec(id)).find(Boolean) || [])[1]);
        const swimmer = tr.querySelector('a[href*="/swimmer/"]');
        const leadoffId = Number(((swimmer ? swimmer.getAttribute("href") : "").match(/\/swimmer\/(\d+)/) || [])[1]);
        if (timeId > 0 && leadoffId > 0) teams.push({ timeId, leadoffId });
    }
    return { teams };
}
"""

# SwimCloud's month names ("Nov.", "Sept.", "June") all start with the month's three-letter abbreviation.
MONTHS = {name: i + 1 for i, name in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"))}
# Results keep trickling in after a meet, so recent meets are read again even once synced.
RECENT_MEET_DAYS = 30
EVENT_KEYS = set(EVENTS)
STROKES = {stroke.lower(): stroke for stroke in STROKE_MAP}
COURSE_BY_LETTER = {"Y": "SCY", "L": "LCM", "S": "SCM"}
INDIVIDUAL_EVENT_RE = re.compile(r"^(\d+)\s+([YLS])\s+(Free|Back|Breast|Fly|IM)$", re.I)
RELAY_LEG_RE = re.compile(r"^(\d+)\s+(?:Mixed\s+)?(Free|Medley)\s+Relay\s*\(([^)]+)\)$", re.I)


def parse_month_day(text: str) -> tuple[int, int] | None:
    """(month, day) from "Nov. 8" or "June 26"."""
    match = re.match(r"^\s*([A-Za-z]+)\.?\s+(\d{1,2})\b", text)
    if not match or match.group(1)[:3].lower() not in MONTHS:
        return None
    return MONTHS[match.group(1)[:3].lower()], int(match.group(2))


def parse_meet_dates(text: str) -> tuple[date, date] | None:
    """Start and end from "June 26, 2025", "Nov 8–9, 2025", "Nov 29–Dec 1, 2025" or "Dec 30, 2024–Jan 2, 2025"."""
    years = re.findall(r"\b\d{4}\b", text)
    if not years:
        return None
    parts = re.split(r"\s*[–—-]\s*", text.strip(), maxsplit=1)
    start = parse_month_day(parts[0])
    if not start:
        return None
    end = start
    if len(parts) == 2:
        day_only = re.match(r"^\s*(\d{1,2})\b", parts[1])
        end = parse_month_day(parts[1]) or ((start[0], int(day_only.group(1))) if day_only else start)
    start_year = re.search(r"\b\d{4}\b", parts[0])
    end_year = int(years[-1])
    try:
        start_date = date(int(start_year.group(0)) if start_year else end_year, *start)
        end_date = date(end_year, *end)
        if end_date < start_date and not start_year:
            start_date = date(end_year - 1, *start)  # "Dec 30–Jan 2, 2025"
    except ValueError:
        return None
    return start_date, max(start_date, end_date)


def meet_dates_from_lines(lines: list[str]) -> tuple[date, date] | None:
    """Dates from a meet entry's text lines: the first one after the name that reads as dates.

    Meet names can hold a year ("Superleague champs 2023"), so the name isn't parsed as a date.
    """
    for line in lines[1:]:
        dates = parse_meet_dates(line)
        if dates:
            return dates
    return None


def individual_event_key(event: str) -> tuple[str, str, str] | None:
    """("Free", "50", "SCY") for "50 Y Free"."""
    match = INDIVIDUAL_EVENT_RE.match(event)
    if not match:
        return None
    return STROKES[match.group(3).lower()], match.group(1), COURSE_BY_LETTER[match.group(2).upper()]


def relay_leadoff_key(event: str, course: str) -> tuple[str, str, str] | None:
    """The flat-start event any leg row's relay was led off in ("200 Medley Relay (Fly)" → 50 Back), or None."""
    match = RELAY_LEG_RE.match(event)
    if not match or int(match.group(1)) % 4:
        return None
    return ("Back" if match.group(2).lower() == "medley" else "Free"), str(int(match.group(1)) // 4), course


def leadoff_event_key(event: str, course: str) -> tuple[str, str, str] | None:
    """The flat-start event a relay lead-off row equals ("200 Medley Relay (Back)" → 50 Back), or None."""
    match = RELAY_LEG_RE.match(event)
    if not match:
        return None
    medley = match.group(2).lower() == "medley"
    label = match.group(3).strip().lower()
    if label not in ("leadoff", "lead-off") and not (medley and label == "back"):
        return None
    return relay_leadoff_key(event, course)


def relay_day_unsure(event_no: int, dated: list[tuple[int, str]]) -> bool:
    """Whether the dated swims around a relay leg in event order leave its day open: none on one side,
    or the two sides on different days. Mirrors inferRelayDate in swimcloud-meets.ts."""
    prev = max((swim for swim in dated if swim[0] < event_no), default=None)
    following = min((swim for swim in dated if swim[0] > event_no), default=None)
    return not prev or not following or prev[1] != following[1]


def meet_course(rows: list[dict]) -> str | None:
    """The course of a meet's individual swims; relay rows don't say."""
    counts = Counter(key[2] for row in rows if (key := individual_event_key(row["event"])))
    return counts.most_common(1)[0][0] if counts else None


async def fetch_one(page, url: str, pacer: AdaptivePacer, script: str = FETCH_JS):
    for attempt in range(MAX_RETRIES):
        data = await page.evaluate(script, url)
        if isinstance(data, dict) and data.get("error") == 429:
            pacer.on_rate_limit()
            wait = RETRY_BASE_SEC * (2 ** attempt) + random.uniform(0, 1)
            # Epoch ms so the app's toast can count down to the retry.
            report_progress(rateLimitedUntil=int((time.time() + wait) * 1000))
            await asyncio.sleep(wait)
            continue
        report_progress(rateLimitedUntil=None)
        if isinstance(data, dict) and "error" in data:
            status = data["error"]
            # Only a 404 means "no times". Anything else (blocked, erroring, signed out) must fail the
            # swimmer instead of saving or skipping them as if they had no results for this event.
            if status == 404:
                return None
            raise SwimCloudScrapeError(f"SwimCloud returned HTTP {status} for {url}")
        pacer.on_success()
        return data
    report_progress(rateLimitedUntil=None)
    raise SwimCloudScrapeError(f"SwimCloud kept rate-limiting {url}")


async def list_swimmer_meets(page, swimmer_id: int, via_home: bool) -> list[dict]:
    """The profile's meets as {meetId, name, start}, from the Latest Results dropdown."""
    await navigate_swimcloud(page, f"https://www.swimcloud.com/swimmer/{swimmer_id}/", via_home=via_home)
    listed = await page.evaluate(SWIMMER_MEETS_JS)
    if not listed and not await page.query_selector(f'a[href*="/swimmer/{swimmer_id}/times"]'):
        # No dropdown and no Times tab: not a profile page, so don't report "no times".
        raise SwimCloudScrapeError(f"Could not read SwimCloud profile {swimmer_id}")
    meets, seen = [], set()
    for meet in listed:
        if meet["meetId"] in seen:
            continue
        seen.add(meet["meetId"])
        lines = meet["lines"]
        dates = meet_dates_from_lines(lines)
        meets.append({"meetId": meet["meetId"], "name": lines[0] if lines else "", "start": dates[0] if dates else None})
    return meets


def meets_to_read(meets: list[dict], synced: set[int]) -> list[dict]:
    """New meets, plus the newest and recent ones, whose results may have changed since they were read."""
    recent = date.today() - timedelta(days=RECENT_MEET_DAYS)
    newest = max((meet["start"] for meet in meets if meet["start"]), default=None)
    return [
        meet for meet in meets
        if meet["meetId"] not in synced or (meet["start"] and (meet["start"] >= recent or meet["start"] == newest))
    ]


class RelayDays:
    """Relay days learned during one sync, shared across its swimmers, since relay teammates are
    usually all being synced together."""

    def __init__(self) -> None:
        # Relay team time id → the day its lead-off swam it.
        self.by_relay: dict[int, str] = {}
        # (meet id, event no) → {team time id: lead-off swimmer id}.
        self.leadoffs: dict[tuple[int, int], dict[int, int]] = {}
        # (swimmer id, event key) → that times_by_event lookup's days by swim id, so a lead-off
        # looked up for a teammate isn't asked again when their own turn comes.
        self.lookups: dict[tuple[int, tuple[str, str, str]], dict] = {}


async def fetch_event_dates(fetch, swimmer_id: int, key: tuple[str, str, str], relays: RelayDays) -> dict:
    """Exact days (and SwimCloud's flags) by swim id for one event, from times_by_event.

    Lead-off rows also carry their relay's team time id, so they date the relay's other legs too.
    """
    if (swimmer_id, key) in relays.lookups:
        return relays.lookups[(swimmer_id, key)]
    stroke, distance, course = key
    event_param = f"{STROKE_MAP[stroke]}|{distance}|{COURSE_MAP[course]}|1"
    data = await fetch(f"https://www.swimcloud.com/api/swimmers/{swimmer_id}/times_by_event/?event={event_param}")
    swims = data if isinstance(data, list) else (data or {}).get("results", (data or {}).get("times", []))
    for swim in swims:
        if swim.get("relay_id") and swim.get("dateofswim"):
            relays.by_relay[int(swim["relay_id"])] = str(swim["dateofswim"])[:10]
    dates = {
        str(swim["id"]): {"date": str(swim["dateofswim"])[:10], "tags": extract_tags(swim)}
        for swim in swims
        if swim.get("id") and swim.get("dateofswim")
    }
    relays.lookups[(swimmer_id, key)] = dates
    return dates


async def date_relay_legs(fetch, meet_id: int, rows: list[dict], course: str | None, dates: dict, relays: RelayDays) -> None:
    """Exact days for one multi-day meet's relay legs 2–4 that the swims around them leave open.

    A leg's meet row links its relay team's time id; the relay's event page names the team's
    lead-off, whose times_by_event row for that relay carries the day.
    """
    dated = [(row["eventNo"], dates[str(row["swimId"])]["date"]) for row in rows if row["eventNo"] and str(row["swimId"]) in dates]
    for row in rows:
        swim_id, event_no = row["swimId"], row["eventNo"]
        if not event_no or str(swim_id) in dates or not RELAY_LEG_RE.match(row["event"]):
            continue
        # Days already known cost nothing, lead-offs included; only open legs 2–4 are looked up.
        if swim_id not in relays.by_relay:
            key = course and relay_leadoff_key(row["event"], course)
            if not key or leadoff_event_key(row["event"], course) or not relay_day_unsure(event_no, dated):
                continue
            if (meet_id, event_no) not in relays.leadoffs:
                data = await fetch(f"https://www.swimcloud.com/results/{meet_id}/event/{event_no}/", EVENT_LEADOFFS_JS)
                relays.leadoffs[(meet_id, event_no)] = {team["timeId"]: team["leadoffId"] for team in (data or {}).get("teams", [])}
            leadoff = relays.leadoffs[(meet_id, event_no)].get(swim_id)
            if leadoff:
                await fetch_event_dates(fetch, leadoff, key, relays)
        day = relays.by_relay.get(swim_id)
        if day:
            dates[str(swim_id)] = {"date": day}
            dated.append((event_no, day))


async def scrape_swimmer_meets(
    page, swimmer_id: int, pacer: AdaptivePacer, synced: set[int], via_home: bool = True, relays: RelayDays | None = None,
) -> dict:
    """One profile's swims, meet by meet: {"meets": [...], "dates": {swimId: {date, tags}}}.

    Meet pages carry relay legs 2–4, which times_by_event never returns, but not each swim's day;
    times_by_event fills that in, asked only for the events swum at the meets read now. Legs 2–4
    whose day that leaves open at a multi-day meet take their relay lead-off's day.
    """
    relays = relays or RelayDays()
    meets = await list_swimmer_meets(page, swimmer_id, via_home)
    pending = meets_to_read(meets, synced)

    read: list[dict] = []
    dates: dict = {}
    looked_up: set[tuple[str, str, str]] = set()
    last_course = None
    requests = 0

    async def paced(url: str, script: str = FETCH_JS):
        """fetch_one, with the pacer's pause before every request after the first."""
        nonlocal requests
        if requests:
            await pacer.wait()
        requests += 1
        return await fetch_one(page, url, pacer, script)

    # One progress step per meet, its date lookups included, so the total is known from the start
    # and the bar never jumps back.
    for i, meet in enumerate(pending):
        report_progress(event=i + 1, events=len(pending), eventLabel=meet["name"])
        data = await paced(
            f"https://www.swimcloud.com/swimmer/{swimmer_id}/times/latest/?meet_id={meet['meetId']}",
            MEET_ROWS_JS,
        )
        if data is None:
            continue
        meet_dates = meet_dates_from_lines(data.get("dateLines") or []) or ((meet["start"], meet["start"]) if meet["start"] else None)
        if not meet_dates:
            continue  # Undated swims can't be saved; left unsynced so the next sync tries again.
        rows = data.get("rows") or []
        course = meet_course(rows)
        # Only the events times sync has always tracked; relay rows are all kept.
        kept = [row for row in rows if (key := individual_event_key(row["event"])) is None or key in EVENT_KEYS]
        read.append({
            "meetId": meet["meetId"],
            "name": meet["name"],
            "startDate": meet_dates[0].isoformat(),
            "endDate": meet_dates[1].isoformat(),
            "course": course,
            "rows": kept,
        })

        # Dates for this meet's events that no earlier meet already looked up. A relay-only meet's
        # lead-offs take the course of the last meet read, its nearest in time so far.
        leadoff_course = course or last_course
        last_course = leadoff_course
        keys = sorted({
            key
            for row in kept
            if (key := individual_event_key(row["event"]) or (leadoff_course and leadoff_event_key(row["event"], leadoff_course)))
            in EVENT_KEYS
        } - looked_up)
        # The toast keeps showing the meet's name while its dates are looked up.
        for key in keys:
            looked_up.add(key)
            dates.update(await fetch_event_dates(paced, swimmer_id, key, relays))
        if meet_dates[0] != meet_dates[1]:
            await date_relay_legs(paced, meet["meetId"], kept, leadoff_course, dates, relays)

    # A meet with only relays takes the course of the nearest meet in time that says.
    known = [meet for meet in read if meet["course"]]
    for meet in read:
        if not meet["course"]:
            nearest = min(known, key=lambda m: abs(date.fromisoformat(m["startDate"]) - date.fromisoformat(meet["startDate"])), default=None)
            meet["course"] = nearest["course"] if nearest else "SCY"

    return {"meets": read, "dates": dates}


async def scrape_bulk_times(swimmer_ids: list[int], synced_meets: dict | None = None):
    swimmer_ids = [sid for sid in swimmer_ids if sid > 0]
    if not swimmer_ids:
        return {"swimmers": {}, "failed": []}

    synced_meets = synced_meets or {}
    pacer = AdaptivePacer()
    pacer.delay = BULK_INITIAL_DELAY_SEC
    relays = RelayDays()
    swimmers: dict[str, dict] = {}
    failed: list[int] = []

    async with async_playwright() as p:
        browser, page = await launch_browser(p)
        for idx, swimmer_id in enumerate(swimmer_ids):
            report_progress(
                current=idx + 1, total=len(swimmer_ids), swimmerId=swimmer_id,
                event=0, events=0, eventLabel=None,
            )
            synced = {int(meet_id) for meet_id in synced_meets.get(str(swimmer_id), [])}
            for attempt in range(2):
                try:
                    # First swimmer (and retries) go via home to clear CF cookies / session.
                    via_home = idx == 0 or attempt > 0
                    result = await scrape_swimmer_meets(page, swimmer_id, pacer, synced, via_home=via_home, relays=relays)
                    # A swimmer the app already saved from the stream stays out of the final result,
                    # which keeps that under the app's request size limit.
                    streamed = _times_sink is not None and await _times_sink(swimmer_id, result)
                    swimmers[str(swimmer_id)] = {"streamed": True} if streamed else result
                    break
                except Exception as e:
                    if attempt == 0:
                        transient = is_transient_navigation_error(e)
                        await asyncio.sleep(1.5 + random.uniform(0, 0.5) if transient else BULK_RETRY_COOLDOWN_SEC)
                        continue
                    print(f"SwimCloud swimmer {swimmer_id} failed: {e}")
                    failed.append(swimmer_id)
                    if _times_sink is not None:
                        await _times_sink(swimmer_id, None)
                    break
            if idx + 1 < len(swimmer_ids):
                gap = BULK_SWIMMER_GAP_SEC + random.uniform(0, 0.75)
                await asyncio.sleep(gap)
                await pacer.wait()
        await browser.close()

    return {"swimmers": swimmers, "failed": failed}
