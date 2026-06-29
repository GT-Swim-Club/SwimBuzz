from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright
from SwimScraper import SwimScraper as ss
import uvicorn
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/roster")
def get_roster(team_id: int, year: int, gender: str = "M"):
    try:
        roster = ss.getRoster(team="", team_ID=team_id, gender=gender, year=year, pro=True)
        return roster
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/times")
async def get_times(swimmer_id: int):
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,  # 👈 non-headless works better against CF
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
                f"https://www.swimcloud.com/swimmer/{swimmer_id}/times/",
                wait_until="domcontentloaded",
                timeout=60000
            )
            await page.wait_for_selector("table tbody tr", timeout=45000)
        except Exception as e:
            html = await page.content()
            await browser.close()
            raise HTTPException(status_code=502, detail=f"Failed: {str(e)}\nHTML: {html[:800]}")

        rows = await page.query_selector_all("table tbody tr")
        for row in rows:
            cols = await row.query_selector_all("td")
            if len(cols) < 4:
                continue
            try:
                results.append({
                    "event": (await cols[0].inner_text()).strip(),
                    "time": (await cols[1].inner_text()).strip(),
                    "course": (await cols[2].inner_text()).strip(),
                    "date": (await cols[3].inner_text()).strip(),
                    "meet": (await cols[4].inner_text()).strip() if len(cols) > 4 else "",
                })
            except:
                continue

        await browser.close()
    return results

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)