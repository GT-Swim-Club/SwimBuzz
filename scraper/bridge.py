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

BRIDGE_POLL_SEC = 2.0
CLOUDFLARE_NOTE = (
    "If Chromium opens, complete the Cloudflare 'I'm human' check in that window."
)

# Set after pairing so exit handlers can clear the app's "running" status.
_session: dict[str, str | None] = {"base_url": None, "token": None}
_disconnected = False


def bridge_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def disconnect_sync() -> None:
    """Best-effort clear of the bridge session when the process exits."""
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
            f"{base_url.rstrip('/')}/api/bridge/disconnect",
            headers=bridge_headers(token),
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
            f"{base_url.rstrip('/')}/api/bridge/register",
            json={"code": code.strip()},
        )
        if res.status_code != 200:
            detail = res.json().get("error", res.text)
            raise RuntimeError(f"Pairing failed: {detail}")
        data = res.json()
        return data["token"]


async def poll_next_job(client: httpx.AsyncClient, base_url: str, token: str) -> dict | None:
    res = await client.get(
        f"{base_url.rstrip('/')}/api/bridge/jobs/next",
        headers=bridge_headers(token),
        timeout=35.0,
    )
    if res.status_code == 401:
        raise RuntimeError("Bridge session expired — generate a new pairing code in the app")
    if res.status_code != 200:
        raise RuntimeError(f"Job poll failed ({res.status_code}): {res.text}")
    data = res.json()
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
        f"{base_url.rstrip('/')}/api/bridge/jobs/{job_id}/complete",
        headers=bridge_headers(token),
        json=body,
        timeout=30.0,
    )
    if res.status_code != 200:
        raise RuntimeError(f"Could not report job result ({res.status_code}): {res.text}")


async def run_job(job: dict) -> object:
    import base64

    from swimcloud_scrape import scrape_bulk_times, scrape_team_roster

    job_type = job["type"]
    payload = job["payload"]

    print(f"\n--- Run scraper job: {job_type} ---")

    if job_type in ("PARSE_MEET_PDF", "PARSE_MEET_SHEET", "PARSE_MEET_PACKET"):
        from pdf_parse import parse_meet_pdf_bytes
        from packet_parse import parse_packet_pdf_bytes
        from sheet_parse import parse_sheet_pdf_bytes

        content = base64.b64decode(payload["file_b64"])
        if job_type == "PARSE_MEET_PDF":
            course = str(payload.get("course", "SCY")).upper()
            team = str(payload.get("team", "")).strip() or None
            return parse_meet_pdf_bytes(content, course, team=team)
        if job_type == "PARSE_MEET_SHEET":
            sheet_type = str(payload.get("sheet_type", "psych"))
            team = str(payload.get("team", "")).strip() or None
            return parse_sheet_pdf_bytes(content, sheet_type, team=team)
        return parse_packet_pdf_bytes(content)

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
        )

    raise RuntimeError(f"Unsupported job type: {job_type}")


async def heartbeat_loop(client: httpx.AsyncClient, base_url: str, token: str) -> None:
    while True:
        await asyncio.sleep(15)
        try:
            await client.post(
                f"{base_url.rstrip('/')}/api/bridge/heartbeat",
                headers=bridge_headers(token),
                timeout=10.0,
            )
        except httpx.RequestError:
            pass


async def bridge_loop(base_url: str, token: str) -> None:
    print(f"Scraper running against {base_url}")
    print("Waiting for sync requests from the app (roster, times, SwimPhone meets)…")
    print("Leave this running while you import rosters, times, or meet results.\n")

    async with httpx.AsyncClient() as client:
        heartbeat = asyncio.create_task(heartbeat_loop(client, base_url, token))
        try:
            while True:
                try:
                    job = await poll_next_job(client, base_url, token)
                    if not job:
                        continue

                    job_id = job["id"]
                    try:
                        result = await run_job(job)
                        await complete_job(client, base_url, token, job_id, result=result)
                        print(f"Job {job_id} completed.\n")
                    except Exception as exc:
                        print(f"Job {job_id} failed: {exc}")
                        await complete_job(client, base_url, token, job_id, error=str(exc))
                except httpx.RequestError as exc:
                    print(f"Connection error: {exc}. Retrying in {BRIDGE_POLL_SEC:.0f}s…")
                    await asyncio.sleep(BRIDGE_POLL_SEC)
                except RuntimeError as exc:
                    print(str(exc))
                    raise
        finally:
            heartbeat.cancel()
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
        default=os.environ.get("BRIDGE_PAIRING_CODE"),
        help="6-digit pairing code from the app (or BRIDGE_PAIRING_CODE env)",
    )
    args = parser.parse_args()

    if not args.code:
        print("Pairing code required. Generate a run command in the app under Run scraper.")
        print("Usage: swimbuzz-bridge --url https://swimbuzz.onrender.com --code 123456")
        print("       (or: python bridge.py --url ... --code ...)")
        sys.exit(1)

    if os.environ.get("PLAYWRIGHT_HEADLESS", "true").lower() in ("1", "true", "yes"):
        print("Tip: headed mode is recommended — the installer sets PLAYWRIGHT_HEADLESS=false automatically.")

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

    await bridge_loop(args.url, token)


def main() -> None:
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        disconnect_sync()
        print("\nBridge stopped.")
    finally:
        disconnect_sync()


if __name__ == "__main__":
    main()
