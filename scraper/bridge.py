#!/usr/bin/env python3
"""Run SwimBuzz local sync bridge on your computer.

Pairs with the hosted app so SwimCloud imports use a headed browser on this
machine (you can complete Cloudflare checks in the window that opens).
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

BRIDGE_POLL_SEC = 2.0
CLOUDFLARE_NOTE = (
    "If Chromium opens, complete the Cloudflare 'I'm human' check in that window."
)


def bridge_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


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
    from main import scrape_bulk_times, scrape_team_roster

    job_type = job["type"]
    payload = job["payload"]

    print(f"\n--- Local sync job: {job_type} ---")
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
    print(f"Connected to {base_url}")
    print("Waiting for SwimCloud sync requests from the app…")
    print("Leave this running while you import rosters or times.\n")

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


async def async_main() -> None:
    parser = argparse.ArgumentParser(description="SwimBuzz local sync bridge")
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
        print("Pairing code required. Generate one in the app under Local sync.")
        print("Usage: python bridge.py --url https://swimbuzz.onrender.com --code 123456")
        sys.exit(1)

    if os.environ.get("PLAYWRIGHT_HEADLESS", "true").lower() in ("1", "true", "yes"):
        print("Tip: set PLAYWRIGHT_HEADLESS=false in scraper/.env so you can complete Cloudflare checks.")

    token = await register_client(args.url, args.code)
    await bridge_loop(args.url, token)


def main() -> None:
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        print("\nBridge stopped.")


if __name__ == "__main__":
    main()
