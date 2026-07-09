from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import os
from pathlib import Path
import uvicorn
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from pdf_parse import parse_meet_pdf_bytes
from packet_parse import parse_packet_pdf_bytes
from sheet_parse import parse_sheet_pdf_bytes
from swimphone_parse import (
    SwimPhoneAccessError,
    SwimPhoneCaptchaError,
    SwimPhoneParseError,
    scrape_swimphone_meet,
)
from swimcloud_scrape import (
    SwimCloudScrapeError,
    scrape_bulk_times,
    scrape_swimmer_times,
    scrape_team_roster,
)

app = FastAPI()

_scrape_lock = asyncio.Lock()

CLOUDFLARE_HINT = (
    "SwimCloud is blocking this server's IP (Cloudflare). "
    "Use Local sync in the app to run imports on your computer."
)


def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def scrape_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, SwimCloudScrapeError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/health/ready")
async def health_ready():
    """Verify Playwright can launch Chromium (catches OOM / sandbox issues on deploy)."""
    try:
        from playwright.async_api import async_playwright
        from swimcloud_scrape import launch_browser

        async with async_playwright() as p:
            browser, page = await launch_browser(p)
            await page.goto("about:blank", timeout=15_000)
            await browser.close()
        return {"ok": True, "playwright": True}
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Playwright browser failed: {e}. "
                "On Render, use Standard (2 GB RAM) or higher for the scraper service."
            ),
        )


@app.get("/roster")
async def get_roster(team_id: int, year: int, gender: str = "M"):
    try:
        return await scrape_team_roster(team_id, year, gender)
    except SwimCloudScrapeError as e:
        raise HTTPException(status_code=502, detail=f"{e} {CLOUDFLARE_HINT}") from e
    except Exception as e:
        raise scrape_http_error(e) from e


class BulkTimesRequest(BaseModel):
    swimmer_ids: list[int]


class SwimPhoneMeetRequest(BaseModel):
    url: str
    team: str | None = None


@app.post("/times/bulk")
async def get_times_bulk(body: BulkTimesRequest):
    async with _scrape_lock:
        try:
            return await scrape_bulk_times(body.swimmer_ids)
        except SwimCloudScrapeError as e:
            raise HTTPException(status_code=502, detail=f"{e} {CLOUDFLARE_HINT}") from e


@app.get("/times")
async def get_times(swimmer_id: int):
    async with _scrape_lock:
        try:
            return await scrape_swimmer_times(swimmer_id)
        except SwimCloudScrapeError as e:
            raise HTTPException(status_code=502, detail=f"{e} {CLOUDFLARE_HINT}") from e


@app.post("/parse-meet-pdf")
async def parse_meet_pdf(
    file: UploadFile = File(...),
    course: str = Form("SCY"),
    team: str = Form(""),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF file required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        parsed = parse_meet_pdf_bytes(content, course.upper(), team=team.strip() or None)
        results = parsed.get("results", [])
        print(
            f"\n--- Parsed {len(results)} swims from {file.filename} "
            f"(meet: {parsed.get('meet_name')!r}, date: {parsed.get('meet_date')}, "
            f"course: {parsed.get('course', course)}) ---"
        )
        for swim in results:
            print(
                f"  {swim['name']:30}  {swim['event']:12}  {swim['time']:>8}  {swim.get('course', '')}"
            )
        print("--- end ---\n")
        return parsed
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")


@app.post("/parse-meet-packet-pdf")
async def parse_meet_packet_pdf(
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF file required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        parsed = parse_packet_pdf_bytes(content)
        session_count = len(parsed.get("sessions", []))
        row_count = sum(len(s.get("rows", [])) for s in parsed.get("sessions", []))
        print(
            f"\n--- Parsed packet {file.filename}: "
            f"{session_count} session(s), {row_count} event row(s) ---\n"
        )
        return parsed
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse packet PDF: {e}")


@app.post("/parse-meet-sheet-pdf")
async def parse_meet_sheet_pdf(
    file: UploadFile = File(...),
    sheet_type: str = Form("auto"),
    team: str = Form("GTSC"),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF file required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    st = sheet_type.strip().lower()
    if st not in {"auto", "psych", "heat", "entries"}:
        raise HTTPException(
            status_code=400,
            detail="sheet_type must be auto, psych, heat, or entries",
        )

    try:
        parsed = parse_sheet_pdf_bytes(
            content,
            None if st == "auto" else st,
            team=team.strip() or "GTSC",
        )
        team_label = (team or "GTSC").strip().upper()
        print(
            f"\n--- Parsed {file.filename} ({parsed.get('sheetType')}): "
            f"{len(parsed.get('entries', []))} {team_label} entries ---\n"
        )
        return parsed
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse sheet PDF: {e}")


@app.post("/scrape-swimphone-meet")
async def scrape_swimphone_meet_endpoint(body: SwimPhoneMeetRequest):
    async with _scrape_lock:
        try:
            parsed = await scrape_swimphone_meet(body.url, team=body.team)
            print(
                f"\n--- SwimPhone scrape: {parsed.get('meet_name')} "
                f"({len(parsed.get('results', []))} swims) ---\n"
            )
            return parsed
        except SwimPhoneAccessError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except SwimPhoneCaptchaError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except SwimPhoneParseError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            print(f"SwimPhone scrape failed: {e}")
            raise HTTPException(status_code=502, detail=f"SwimPhone scrape failed: {e}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
