#!/usr/bin/env python3
"""SwimBuzz Run scraper client for your computer.

Pairs with the hosted app so SwimCloud imports use a headed browser on this
machine (you can complete Cloudflare checks in the window that opens).
"""

from __future__ import annotations

import argparse
import asyncio
import atexit
import os
import signal
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

SCRAPER_POLL_SEC = 2.0
CLOUDFLARE_NOTE = (
    "If Chromium opens, complete the Cloudflare 'I'm human' check in that window."
)
# Modules re-downloaded from the app on each start so scrape fixes apply without reinstall.
SYNC_FILES = (
    "scraper.py",
    "swimcloud_scrape.py",
    "swimphone_parse.py",
    "swim_common.py",
)

# Set after pairing so exit handlers can clear the app's "running" status.
_session: dict[str, str | None] = {"base_url": None, "token": None}
_disconnected = False


class ScraperShutdown(Exception):
    """Raised when the app terminates this scraper session."""


def scraper_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def sync_scraper_modules(base_url: str) -> bool:
    """Pull latest scrape modules from the app. True if scraper.py itself changed."""
    root = Path(__file__).resolve().parent
    updated: list[str] = []
    scraper_changed = False

    async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
        for name in SYNC_FILES:
            url = f"{base_url.rstrip('/')}/scraper/{name}"
            try:
                res = await client.get(url)
            except httpx.RequestError as exc:
                print(f"Could not sync {name}: {exc}")
                continue
            if res.status_code != 200 or not res.content:
                continue
            dest = root / name
            old = dest.read_bytes() if dest.exists() else b""
            if old == res.content:
                continue
            dest.write_bytes(res.content)
            updated.append(name)
            if name == "scraper.py":
                scraper_changed = True

    if updated:
        print("Updated scraper modules from app: " + ", ".join(updated))
    return scraper_changed


def disconnect_sync() -> None:
    """Best-effort clear of the scraper session when the process exits."""
    global _disconnected
    if _disconnected:
        return
    base_url = _session.get("base_url")
    token = _session.get("token")
    if not base_url or not token:
        return
    _disconnected = True
    try:
        httpx.post(
            f"{base_url.rstrip('/')}/api/scraper/disconnect",
            headers=scraper_headers(token),
            timeout=3.0,
        )
    except Exception:
        pass


def _handle_exit_signal(signum: int, _frame) -> None:
    disconnect_sync()
    raise SystemExit(128 + signum)


async def register_client(base_url: str, code: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{base_url.rstrip('/')}/api/scraper/register",
            json={"code": code.strip()},
        )
        if res.status_code != 200:
            detail = res.json().get("error", res.text)
            raise RuntimeError(f"Pairing failed: {detail}")
        data = res.json()
        return data["token"]


async def poll_next_job(client: httpx.AsyncClient, base_url: str, token: str) -> dict | None:
    res = await client.get(
        f"{base_url.rstrip('/')}/api/scraper/jobs/next",
        headers=scraper_headers(token),
        timeout=35.0,
    )
    if res.status_code in (401, 410):
        raise ScraperShutdown()
    if res.status_code != 200:
        raise RuntimeError(f"Job poll failed ({res.status_code}): {res.text}")
    data = res.json()
    if data.get("shutdown"):
        raise ScraperShutdown()
    return data.get("job")


async def complete_job(
    client: httpx.AsyncClient,
    base_url: str,
    token: str,
    job_id: str,
    *,
    result=None,
    error: str | None = None,
) -> None:
    body = {"error": error} if error else {"result": result}
    res = await client.post(
        f"{base_url.rstrip('/')}/api/scraper/jobs/{job_id}/complete",
        headers=scraper_headers(token),
        json=body,
        timeout=30.0,
    )
    if res.status_code != 200:
        raise RuntimeError(f"Could not report job result ({res.status_code}): {res.text}")


async def run_job(job: dict) -> object:
    from swimcloud_scrape import scrape_bulk_times, scrape_team_roster

    job_type = job["type"]
    payload = job["payload"]

    print(f"\n--- Run scraper job: {job_type} ---")

    print(CLOUDFLARE_NOTE)

    if job_type == "ROSTER":
        return await scrape_team_roster(
            int(payload["team_id"]),
            int(payload["year"]),
            str(payload.get("gender", "M")),
        )

    if job_type == "TIMES_BULK":
        swimmer_ids = [int(sid) for sid in payload.get("swimmer_ids", [])]
        return await scrape_bulk_times(swimmer_ids)

    if job_type == "SWIMPHONE_MEET":
        from swimphone_parse import scrape_swimphone_meet

        return await scrape_swimphone_meet(
            str(payload["url"]),
            team=str(payload.get("team") or "").strip() or None,
            metadata_only=bool(payload.get("metadata_only")),
        )

    raise RuntimeError(f"Unsupported job type: {job_type}")


async def heartbeat_loop(
    client: httpx.AsyncClient,
    base_url: str,
    token: str,
    stop: asyncio.Event,
) -> None:
    """Keep the session alive and exit quickly when the app terminates us."""
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=5.0)
            return
        except asyncio.TimeoutError:
            pass
        try:
            res = await client.post(
                f"{base_url.rstrip('/')}/api/scraper/heartbeat",
                headers=scraper_headers(token),
                timeout=10.0,
            )
            if res.status_code in (401, 410):
                stop.set()
                return
        except httpx.RequestError:
            pass


async def scraper_loop(base_url: str, token: str) -> None:
    print(f"Scraper running against {base_url}")
    print("Waiting for sync requests from the app (roster, times, SwimPhone meets)…")
    print("Leave this running while you import rosters, times, or meet results.\n")

    stop = asyncio.Event()
    stopped_by_app = False
    async with httpx.AsyncClient() as client:
        heartbeat = asyncio.create_task(heartbeat_loop(client, base_url, token, stop))
        try:
            while not stop.is_set():
                try:
                    job = await poll_next_job(client, base_url, token)
                    if stop.is_set():
                        stopped_by_app = True
                        break
                    if not job:
                        continue

                    job_id = job["id"]
                    job_task = asyncio.create_task(run_job(job))
                    stop_task = asyncio.create_task(stop.wait())
                    try:
                        done, pending = await asyncio.wait(
                            {job_task, stop_task},
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                        for task in pending:
                            task.cancel()
                            try:
                                await task
                            except asyncio.CancelledError:
                                pass

                        if stop_task in done or stop.is_set():
                            stopped_by_app = True
                            print(f"Job {job_id} cancelled — scraper terminated from the app.")
                            try:
                                await complete_job(
                                    client,
                                    base_url,
                                    token,
                                    job_id,
                                    error="Scraper terminated from the app",
                                )
                            except Exception:
                                pass
                            break

                        try:
                            result = job_task.result()
                            await complete_job(
                                client, base_url, token, job_id, result=result
                            )
                            print(f"Job {job_id} completed.\n")
                        except Exception as exc:
                            print(f"Job {job_id} failed: {exc}")
                            await complete_job(
                                client, base_url, token, job_id, error=str(exc)
                            )
                    finally:
                        if not job_task.done():
                            job_task.cancel()
                            try:
                                await job_task
                            except asyncio.CancelledError:
                                pass
                        if not stop_task.done():
                            stop_task.cancel()
                            try:
                                await stop_task
                            except asyncio.CancelledError:
                                pass
                except ScraperShutdown:
                    stopped_by_app = True
                    stop.set()
                    break
                except httpx.RequestError as exc:
                    if stop.is_set():
                        stopped_by_app = True
                        break
                    print(f"Connection error: {exc}. Retrying in {SCRAPER_POLL_SEC:.0f}s…")
                    await asyncio.sleep(SCRAPER_POLL_SEC)
                except RuntimeError as exc:
                    print(str(exc))
                    raise
            if stopped_by_app or stop.is_set():
                print("\nScraper terminated from the app.")
        finally:
            stop.set()
            heartbeat.cancel()
            try:
                await heartbeat
            except asyncio.CancelledError:
                pass
            disconnect_sync()


async def async_main() -> None:
    parser = argparse.ArgumentParser(description="SwimBuzz Run scraper")
    parser.add_argument(
        "--url",
        default=os.environ.get("SWIMBUZZ_URL", "http://localhost:3000"),
        help="SwimBuzz app URL (default: SWIMBUZZ_URL env or http://localhost:3000)",
    )
    parser.add_argument(
        "--code",
        default=os.environ.get("SCRAPER_PAIRING_CODE"),
        help="6-digit pairing code from the app (or SCRAPER_PAIRING_CODE env)",
    )
    args = parser.parse_args()

    if not args.code:
        print("Pairing code required. Generate a run command in the app under Run scraper.")
        print("Usage: swimbuzz-scraper --url https://swimbuzz.gtswimclub.com --code 123456")
        print("       (or: python scraper.py --url ... --code ...)")
        sys.exit(1)

    if os.environ.get("PLAYWRIGHT_HEADLESS", "true").lower() in ("1", "true", "yes"):
        print("Tip: headed mode is recommended — the installer sets PLAYWRIGHT_HEADLESS=false automatically.")

    # Keep ~/.swimbuzz-scraper in sync with the app (e.g. SwimPhone mrid split URLs).
    if os.environ.get("SWIMBUZZ_SCRAPER_NOSYNC", "").lower() not in ("1", "true", "yes"):
        try:
            scraper_changed = await sync_scraper_modules(args.url)
        except Exception as exc:
            print(f"Module sync skipped: {exc}")
            scraper_changed = False
        if scraper_changed:
            print("Restarting with updated scraper client…")
            os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]])

    token = await register_client(args.url, args.code)
    _session["base_url"] = args.url
    _session["token"] = token
    atexit.register(disconnect_sync)
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle_exit_signal)
        except (ValueError, OSError):
            pass
    if hasattr(signal, "SIGHUP"):
        try:
            signal.signal(signal.SIGHUP, _handle_exit_signal)
        except (ValueError, OSError):
            pass

    await scraper_loop(args.url, token)


def main() -> None:
    try:
        asyncio.run(async_main())
    except ScraperShutdown:
        print("\nScraper terminated from the app.")
    except KeyboardInterrupt:
        print("\nScraper stopped.")
    finally:
        disconnect_sync()


if __name__ == "__main__":
    main()
