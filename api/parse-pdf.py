"""Vercel Python Function: parse a meet PDF that already lives in Supabase Storage.

Kept as a bare BaseHTTPRequestHandler (no Flask/FastAPI) — a web framework in
the root requirements.txt would make Vercel's framework-preset detection hand
every request to that app instead of Next.js.

The function never accepts raw PDF bytes (Vercel caps request/response bodies
at ~4.5MB); callers upload the PDF to Supabase Storage first and pass the
resulting URL. `url` is restricted to the Supabase storage host so this
endpoint can't be used as an open SSRF fetch proxy.
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from pdf_parsers.nqt_parse import parse_nqt_pdf_bytes  # noqa: E402
from pdf_parsers.packet_parse import parse_packet_pdf_bytes  # noqa: E402
from pdf_parsers.pdf_parse import parse_meet_pdf_bytes  # noqa: E402
from pdf_parsers.sheet_parse import parse_sheet_pdf_bytes  # noqa: E402

MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
STORAGE_PATH_PREFIX = "/storage/v1/object/public/meet-files/"


def _allowed_host() -> str | None:
    supabase_url = os.environ.get("SUPABASE_URL")
    if not supabase_url:
        return None
    return urlparse(supabase_url).hostname


def _validate_pdf_url(url: str) -> str | None:
    """Return an error message, or None if the url is safe to fetch."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return "Invalid url"
    if parsed.scheme != "https":
        return "url must be https"
    allowed_host = _allowed_host()
    if not allowed_host or parsed.hostname != allowed_host:
        return "url host is not allowlisted"
    if not parsed.path.startswith(STORAGE_PATH_PREFIX):
        return "url path is not allowlisted"
    return None


def _fetch_pdf_bytes(url: str) -> bytes:
    chunks: list[bytes] = []
    total = 0
    with httpx.stream("GET", url, timeout=30.0, follow_redirects=False) as res:
        res.raise_for_status()
        for chunk in res.iter_bytes():
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError("PDF exceeds size limit")
            chunks.append(chunk)
    return b"".join(chunks)


def _dispatch(kind: str, content: bytes, payload: dict) -> dict:
    if kind == "results":
        course = str(payload.get("course") or "SCY").upper()
        team = (payload.get("team") or "").strip() or None
        return parse_meet_pdf_bytes(content, course, team=team)
    if kind == "sheet":
        sheet_type = payload.get("sheet_type")
        team = (payload.get("team") or "").strip() or None
        return parse_sheet_pdf_bytes(content, sheet_type, team=team)
    if kind == "packet":
        return parse_packet_pdf_bytes(content)
    if kind == "nqt":
        return parse_nqt_pdf_bytes(content)
    raise ValueError(f"Unsupported kind: {kind}")


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:
        try:
            secret = os.environ.get("PDF_PARSER_SECRET")
            if not secret or self.headers.get("X-Parser-Secret") != secret:
                self._send_json(401, {"error": "Unauthorized"})
                return

            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                payload = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                self._send_json(400, {"error": "Invalid JSON body"})
                return

            kind = payload.get("kind")
            url = payload.get("url")
            if not isinstance(kind, str) or not isinstance(url, str):
                self._send_json(400, {"error": "kind and url are required"})
                return

            url_error = _validate_pdf_url(url)
            if url_error:
                self._send_json(400, {"error": url_error})
                return

            try:
                content = _fetch_pdf_bytes(url)
            except Exception as exc:  # network/upstream failure
                self._send_json(502, {"error": f"Could not download PDF: {exc}"})
                return

            try:
                result = _dispatch(kind, content, payload)
            except Exception as exc:  # expected parse failure
                self._send_json(422, {"error": str(exc)})
                return

            self._send_json(200, result)
        except Exception as exc:  # unexpected failure
            self._send_json(500, {"error": str(exc)})
