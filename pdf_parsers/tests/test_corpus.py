"""Snapshot/invariant harness for the meet-PDF parsers.

Runs every fixture PDF under fixtures/meet-pdfs/ (gitignored, not checked
into the repo) through the matching parser and checks format-level
invariants plus a committed JSON snapshot. Skips entirely when the fixture
corpus is absent so `pytest` still passes on clones without the private
corpus — see pdf_parsers/README.md for how to obtain it.

Update snapshots after an intentional behavior change with:
    pytest pdf_parsers/tests/test_corpus.py --snapshot-update
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from pdf_parsers.packet_parse import parse_packet_pdf_bytes
from pdf_parsers.pdf_parse import detect_hytek_doc_type, parse_meet_pdf_bytes
from pdf_parsers.sheet_parse import parse_sheet_pdf_bytes

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "fixtures" / "meet-pdfs"
SNAPSHOT_DIR = Path(__file__).resolve().parent / "snapshots"

FOLDER_KIND = {
    "heat-sheets": "heat",
    "psych-sheets": "psych",
    "meet-packets": "packet",
    "results": "results",
}

# Per-file minimum entry/event/result count. Anything not listed defaults to 1
# (parsing must produce something) — exact counts are pinned precisely by the
# committed snapshot; this floor only catches a collapse to near-empty output
# in a way that stays readable to a maintainer who has never opened the PDF.
MIN_COUNT: dict[str, int] = {}

# CID-ligature / dropped-fl artifacts and private-use glyphs that should never
# survive into a parsed event string.
BAD_STROKE_FRAGMENT = re.compile(r"butter\s*ly|ﬁ|ﬂ|ﬀ|ﬃ|ﬄ|\(cid:\d+\)|[-]", re.I)
STATUS_TOKENS = {"NT", "NQT", "NS", "DQ", "DFS", "DNF", "SCR", "DNS"}


def _iter_fixtures() -> list[tuple[str, Path]]:
    if not FIXTURES_DIR.is_dir():
        return []
    out: list[tuple[str, Path]] = []
    for folder, kind in FOLDER_KIND.items():
        directory = FIXTURES_DIR / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.pdf")):
            out.append((kind, path))
    return out


FIXTURES = _iter_fixtures()

pytestmark = pytest.mark.skipif(
    not FIXTURES_DIR.is_dir(),
    reason=(
        "fixtures/meet-pdfs/ not found — local-only PDF corpus, "
        "see pdf_parsers/README.md"
    ),
)


def _snapshot_path(kind: str, path: Path) -> Path:
    return SNAPSHOT_DIR / kind / f"{path.stem}.json"


def _load_pdf_text(path: Path) -> str:
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def _parse(kind: str, content: bytes) -> dict[str, Any]:
    if kind == "results":
        return parse_meet_pdf_bytes(content, team=None)
    if kind in ("heat", "psych"):
        return parse_sheet_pdf_bytes(content, sheet_type=kind, team=None)
    if kind == "packet":
        return parse_packet_pdf_bytes(content)
    raise ValueError(f"unknown fixture kind {kind!r}")


def _entry_count(kind: str, parsed: dict[str, Any]) -> int:
    if kind == "results":
        return len(parsed.get("results", [])) + len(parsed.get("relay_results", []))
    if kind in ("heat", "psych"):
        return len(parsed.get("entries", []))
    if kind == "packet":
        return sum(len(session.get("rows", [])) for session in parsed.get("sessions", []))
    return 0


def _all_event_strings(kind: str, parsed: dict[str, Any]) -> list[str]:
    if kind == "results":
        rows = parsed.get("results", []) + parsed.get("relay_results", [])
        return [str(row.get("event") or "") for row in rows]
    if kind in ("heat", "psych"):
        return [str(entry.get("event") or "") for entry in parsed.get("entries", [])]
    if kind == "packet":
        return [
            str(row.get("event") or "")
            for session in parsed.get("sessions", [])
            for row in session.get("rows", [])
        ]
    return []


def _relay_leg_counts(kind: str, parsed: dict[str, Any]) -> list[int]:
    rows: list[dict[str, Any]] = []
    if kind == "results":
        rows = parsed.get("relay_results", [])
    elif kind in ("heat", "psych"):
        rows = [e for e in parsed.get("entries", []) if e.get("entryType") == "relay_team"]
    counts = []
    for row in rows:
        swimmers = row.get("relaySwimmers") or []
        if swimmers:
            counts.append(len(swimmers))
    return counts


def _status_tokens_in_time_fields(kind: str, parsed: dict[str, Any]) -> list[str]:
    """Values that should live in a status/timeStatus field but ended up in a time field."""
    bad: list[str] = []
    if kind in ("heat", "psych"):
        for entry in parsed.get("entries", []):
            seed = entry.get("seedTime")
            if seed and str(seed).upper() in STATUS_TOKENS:
                bad.append(str(seed))
    if kind == "results":
        for row in parsed.get("relay_results", []):
            seed = row.get("seedTime")
            if seed and str(seed).upper() in STATUS_TOKENS:
                bad.append(str(seed))
    return bad


@pytest.mark.parametrize("kind,path", FIXTURES, ids=[p.name for _, p in FIXTURES])
def test_classification(kind: str, path: Path) -> None:
    text = _load_pdf_text(path)
    detected = detect_hytek_doc_type(text)
    assert detected == kind, f"{path.name}: classified as {detected!r}, expected {kind!r}"


@pytest.mark.parametrize("kind,path", FIXTURES, ids=[p.name for _, p in FIXTURES])
def test_parses_and_matches_invariants(kind: str, path: Path, request: pytest.FixtureRequest) -> None:
    content = path.read_bytes()
    parsed = _parse(kind, content)  # must not raise

    floor = MIN_COUNT.get(path.name, 1)
    count = _entry_count(kind, parsed)
    assert count >= floor, f"{path.name}: got {count} entries/rows, expected >= {floor}"

    for event in _all_event_strings(kind, parsed):
        assert not BAD_STROKE_FRAGMENT.search(event), (
            f"{path.name}: unnormalized stroke/ligature in event {event!r}"
        )

    bad_time_values = _status_tokens_in_time_fields(kind, parsed)
    assert not bad_time_values, f"{path.name}: status token(s) stored in a time field: {bad_time_values}"

    for leg_count in _relay_leg_counts(kind, parsed):
        # A relay can legitimately show fewer than 4 known swimmers — Hy-Tek
        # results sometimes list only the leadoff name for a team's B/C squad
        # — but never more than 4 (that's roster bleed from an adjacent team).
        assert 1 <= leg_count <= 4, f"{path.name}: relay with {leg_count} legs"

    if kind == "results":
        assert parsed.get("meet_name"), f"{path.name}: missing meet_name"
        assert parsed.get("meet_date"), f"{path.name}: missing meet_date"
    if kind in ("heat", "psych"):
        assert parsed.get("meet_name"), f"{path.name}: missing meet_name"

    snap_path = _snapshot_path(kind, path)
    if request.config.getoption("--snapshot-update"):
        snap_path.parent.mkdir(parents=True, exist_ok=True)
        snap_path.write_text(json.dumps(parsed, indent=2, sort_keys=True, default=str) + "\n")
        return

    if not snap_path.exists():
        pytest.fail(
            f"No snapshot for {path.name} — run "
            "`pytest pdf_parsers/tests/test_corpus.py --snapshot-update` to record one."
        )
    expected = json.loads(snap_path.read_text())
    assert parsed == expected, f"{path.name}: parsed output no longer matches the committed snapshot"
