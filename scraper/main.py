from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from pydantic import BaseModel
import asyncio
import random
import uvicorn

from pdf_parse import parse_meet_pdf_bytes
from swimphone_parse import (
    SwimPhoneCaptchaError,
    SwimPhoneParseError,
    scrape_swimphone_meet,
)

app = FastAPI()

# Adaptive pacing — conservative to avoid SwimCloud 429s
MIN_DELAY_SEC = 1.2
MAX_DELAY_SEC = 8.0
INITIAL_DELAY_SEC = 1.5
MAX_RETRIES = 6
RETRY_BASE_SEC = 12
BULK_SWIMMER_GAP_SEC = 5.0
BULK_INITIAL_DELAY_SEC = 2.0

_scrape_lock = asyncio.Lock()

STROKE_MAP = {
    "Free": "1", "Back": "2", "Breast": "3", "Fly": "4", "IM": "5",
}
COURSE_MAP = {"SCY": "Y", "LCM": "L", "SCM": "S"}

EVENTS = [
    ("Free",   "50",   "SCY"), ("Free",   "50",   "LCM"),
    ("Free",   "100",  "SCY"), ("Free",   "100",  "LCM"),
    ("Free",   "200",  "SCY"), ("Free",   "200",  "LCM"),
    ("Free",   "400",  "SCY"), ("Free",   "400",  "LCM"),
    ("Free",   "500",  "SCY"),
    ("Free",   "800",  "LCM"),
    ("Free",   "1000", "SCY"),
    ("Free",   "1500", "LCM"),
    ("Free",   "1650", "SCY"),
    ("Back",   "50",   "SCY"), ("Back",   "50",   "LCM"),
    ("Back",   "100",  "SCY"), ("Back",   "100",  "LCM"),
    ("Back",   "200",  "SCY"), ("Back",   "200",  "LCM"),
    ("Breast", "50",   "SCY"), ("Breast", "50",   "LCM"),
    ("Breast", "100",  "SCY"), ("Breast", "100",  "LCM"),
    ("Breast", "200",  "SCY"), ("Breast", "200",  "LCM"),
    ("Fly",    "50",   "SCY"), ("Fly",    "50",   "LCM"),
    ("Fly",    "100",  "SCY"), ("Fly",    "100",  "LCM"),
    ("Fly",    "200",  "SCY"), ("Fly",    "200",  "LCM"),
    ("IM",     "100",  "SCY"),
    ("IM",     "200",  "SCY"), ("IM",     "200",  "LCM"),
    ("IM",     "400",  "SCY"), ("IM",     "400",  "LCM"),
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

BATCH_FETCH_JS = """
async (urls) => {
    return Promise.all(urls.map(async (url) => {
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest",
            },
        });
        if (!res.ok) return { error: res.status, url };
        return { url, data: await res.json() };
    }));
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/roster")
async def get_roster(team_id: int, year: int, gender: str = "M"):
    # map year to season_id (SwimCloud uses season IDs)
    # 2021-22 = season 25, 2022-23 = 26, 2023-24 = 27, 2024-25 = 28
    season_id = (year - 1997)  # rough formula, adjust if off

    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()
        stealth = Stealth()
        await stealth.apply_stealth_async(page)

        try:
            await page.goto(
                f"https://www.swimcloud.com/team/{team_id}/roster/?gender={gender}&season_id={season_id}",
                wait_until="domcontentloaded",
                timeout=60000
            )
            await page.wait_for_selector("table tbody tr", timeout=45000)
        except Exception as e:
            html = await page.content()
            await browser.close()
            raise HTTPException(status_code=500, detail=f"Failed: {str(e)}\nHTML: {html[:500]}")

        rows = await page.query_selector_all("table tbody tr")
        for row in rows:
            cols = await row.query_selector_all("td")
            if len(cols) < 2:
                continue
            try:
                # swimmer name + link
                name_el = await row.query_selector("a[href*='/swimmer/']")
                if not name_el:
                    continue
                name = (await name_el.inner_text()).strip()
                href = await name_el.get_attribute("href")
                # extract swimmer ID from href e.g. /swimmer/1492387/
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
            except:
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


async def fetch_times_by_events(
    page,
    swimmer_id: int,
    pacer: AdaptivePacer,
) -> list:
    """Fetch times one event at a time to avoid rate limits."""
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
    await page.goto(
        f"https://www.swimcloud.com/swimmer/{swimmer_id}/times/",
        wait_until="domcontentloaded",
        timeout=60000,
    )
    await page.wait_for_selector("button.c-tabs__link", timeout=45000)


class BulkTimesRequest(BaseModel):
    swimmer_ids: list[int]


class SwimPhoneMeetRequest(BaseModel):
    url: str


@app.post("/times/bulk")
async def get_times_bulk(body: BulkTimesRequest):
    async with _scrape_lock:
        return await _get_times_bulk(body)


async def _get_times_bulk(body: BulkTimesRequest):
    swimmer_ids = [sid for sid in body.swimmer_ids if sid > 0]
    if not swimmer_ids:
        return {"swimmers": {}, "failed": []}

    pacer = AdaptivePacer()
    pacer.delay = BULK_INITIAL_DELAY_SEC
    swimmers: dict[str, list] = {}
    failed: list[int] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()
        stealth = Stealth()
        await stealth.apply_stealth_async(page)

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


@app.get("/times")
async def get_times(swimmer_id: int):
    async with _scrape_lock:
        return await _get_times(swimmer_id)


async def _get_times(swimmer_id: int):
    pacer = AdaptivePacer()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()
        stealth = Stealth()
        await stealth.apply_stealth_async(page)

        try:
            await open_swimmer_times_page(page, swimmer_id)
        except Exception as e:
            await browser.close()
            raise HTTPException(status_code=502, detail=f"Failed to load page: {str(e)}")

        results = await fetch_times_by_events(page, swimmer_id, pacer)

        await browser.close()

    return results


@app.post("/parse-meet-pdf")
async def parse_meet_pdf(
    file: UploadFile = File(...),
    course: str = Form("SCY"),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF file required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        parsed = parse_meet_pdf_bytes(content, course.upper())
        results = parsed.get("results", [])
        print(f"\n--- Parsed {len(results)} swims from {file.filename} (course: {parsed.get('course', course)}) ---")
        for swim in results:
            print(
                f"  {swim['name']:30}  {swim['event']:12}  {swim['time']:>8}  {swim.get('course', '')}"
            )
        print("--- end ---\n")
        return parsed
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")


@app.post("/scrape-swimphone-meet")
async def scrape_swimphone_meet_endpoint(body: SwimPhoneMeetRequest):
    async with _scrape_lock:
        try:
            parsed = await scrape_swimphone_meet(body.url)
            print(
                f"\n--- SwimPhone scrape: {parsed.get('meet_name')} "
                f"({len(parsed.get('results', []))} swims) ---\n"
            )
            return parsed
        except SwimPhoneCaptchaError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except SwimPhoneParseError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            print(f"SwimPhone scrape failed: {e}")
            raise HTTPException(status_code=502, detail=f"SwimPhone scrape failed: {e}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

   