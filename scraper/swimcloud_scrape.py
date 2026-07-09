"""SwimCloud browser scraping — shared by the FastAPI scraper and local sync bridge."""

from __future__ import annotations

import asyncio
import os
import random
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

load_dotenv(Path(__file__).resolve().parent / ".env")


class SwimCloudScrapeError(Exception):
    """Raised when SwimCloud cannot be scraped (Cloudflare, timeout, etc.)."""


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


async def wait_past_cloudflare(page, timeout_ms: int = 120_000) -> None:
    deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
    while asyncio.get_event_loop().time() < deadline:
        title = await page.title()
        html = await page.content()
        if not is_cloudflare_challenge(html, title):
            return
        await asyncio.sleep(2.5)

    html = await page.content()
    title = await page.title()
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
) -> None:
    await page.goto("https://www.swimcloud.com/", wait_until="domcontentloaded", timeout=60_000)
    await wait_past_cloudflare(page)
    await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    await wait_past_cloudflare(page)
    if not selector:
        return
    try:
        await page.wait_for_selector(selector, timeout=selector_timeout)
    except Exception as e:
        html = await page.content()
        title = await page.title()
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
            html = await page.content()
            await browser.close()
            if is_cloudflare_challenge(html, await page.title()):
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


def swim_record_to_result(swim: dict, stroke: str, distance: str, course: str) -> dict | None:
    event_time = swim.get("eventtime")
    if not event_time:
        return None
    return {
        "event": f"{distance} {stroke}",
        "course": course,
        "time": event_time,
        "date": swim.get("dateofswim") or "",
        "meet": swim.get("name") or "",
        "tags": extract_tags(swim),
    }


def build_event_requests(swimmer_id: int) -> list[dict]:
    requests = []
    for stroke, distance, course in EVENTS:
        stroke_code = STROKE_MAP[stroke]
        course_code = COURSE_MAP[course]
        event_param = f"{stroke_code}|{distance}|{course_code}|1"
        requests.append({
            "url": f"https://www.swimcloud.com/api/swimmers/{swimmer_id}/times_by_event/?event={event_param}",
            "stroke": stroke,
            "distance": distance,
            "course": course,
            "label": f"{distance} {stroke} {course}",
        })
    return requests


async def fetch_one(page, url: str, pacer: AdaptivePacer, label: str):
    for attempt in range(MAX_RETRIES):
        data = await page.evaluate(FETCH_JS, url)
        if isinstance(data, dict) and data.get("error") == 429:
            pacer.on_rate_limit()
            wait = RETRY_BASE_SEC * (2 ** attempt) + random.uniform(0, 1)
            print(f"429 on {label}, waiting {wait:.0f}s (retry {attempt + 1}/{MAX_RETRIES})")
            await asyncio.sleep(wait)
            continue
        if isinstance(data, dict) and "error" in data:
            return None
        pacer.on_success()
        return data
    print(f"Giving up on {label} after {MAX_RETRIES} retries")
    return None


def append_times(results: list, data, stroke: str, distance: str, course: str):
    times = data if isinstance(data, list) else data.get("results", data.get("times", []))
    for swim in times:
        row = swim_record_to_result(swim, stroke, distance, course)
        if row:
            results.append(row)


async def fetch_times_by_events(page, swimmer_id: int, pacer: AdaptivePacer) -> list:
    results = []
    requests = build_event_requests(swimmer_id)
    for i, req in enumerate(requests):
        data = await fetch_one(page, req["url"], pacer, req["label"])
        if data:
            append_times(results, data, req["stroke"], req["distance"], req["course"])
        if i + 1 < len(requests):
            await pacer.wait()
    return results


async def open_swimmer_times_page(page, swimmer_id: int):
    await navigate_swimcloud(
        page,
        f"https://www.swimcloud.com/swimmer/{swimmer_id}/times/",
        selector="button.c-tabs__link",
    )


async def scrape_bulk_times(swimmer_ids: list[int]):
    swimmer_ids = [sid for sid in swimmer_ids if sid > 0]
    if not swimmer_ids:
        return {"swimmers": {}, "failed": []}

    pacer = AdaptivePacer()
    pacer.delay = BULK_INITIAL_DELAY_SEC
    swimmers: dict[str, list] = {}
    failed: list[int] = []

    async with async_playwright() as p:
        browser, page = await launch_browser(p)
        for idx, swimmer_id in enumerate(swimmer_ids):
            label = f"{idx + 1}/{len(swimmer_ids)}"
            try:
                await open_swimmer_times_page(page, swimmer_id)
                times = await fetch_times_by_events(page, swimmer_id, pacer)
                swimmers[str(swimmer_id)] = times
                print(f"Bulk sync [{label}] swimmer {swimmer_id}: {len(times)} times")
            except Exception as e:
                print(f"Bulk sync [{label}] swimmer {swimmer_id} failed: {e}")
                failed.append(swimmer_id)
            if idx + 1 < len(swimmer_ids):
                gap = BULK_SWIMMER_GAP_SEC + random.uniform(0, 0.75)
                await asyncio.sleep(gap)
                await pacer.wait()
        await browser.close()

    return {"swimmers": swimmers, "failed": failed}


async def scrape_swimmer_times(swimmer_id: int):
    pacer = AdaptivePacer()
    async with async_playwright() as p:
        browser, page = await launch_browser(p)
        try:
            await open_swimmer_times_page(page, swimmer_id)
        except SwimCloudScrapeError:
            await browser.close()
            raise
        except Exception as e:
            await browser.close()
            raise SwimCloudScrapeError(f"Failed to load page: {e}") from e
        results = await fetch_times_by_events(page, swimmer_id, pacer)
        await browser.close()
    return results
