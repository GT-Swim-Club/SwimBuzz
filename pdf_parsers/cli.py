"""Local-dev transport: parse a PDF from stdin, print the result JSON to stdout.

`apps/web/src/lib/pdf-parser-client.ts` shells out to
`python3 -m pdf_parsers.cli` when `PDF_PARSER_URL` is unset — `pnpm dev:web`
runs `apps/web/server.js`, not `vercel dev`, so there's no local
`/api/parse-pdf` function to call.
"""

from __future__ import annotations

import argparse
import json
import sys

from .nqt_parse import parse_nqt_pdf_bytes
from .packet_parse import parse_packet_pdf_bytes
from .pdf_parse import parse_meet_pdf_bytes
from .sheet_parse import parse_sheet_pdf_bytes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", required=True, choices=["results", "sheet", "packet", "nqt"])
    parser.add_argument("--course", default="SCY")
    parser.add_argument("--team", default=None)
    parser.add_argument("--sheet-type", default=None)
    args = parser.parse_args()

    content = sys.stdin.buffer.read()
    team = (args.team or "").strip() or None

    try:
        if args.kind == "results":
            result = parse_meet_pdf_bytes(content, args.course, team=team)
        elif args.kind == "sheet":
            result = parse_sheet_pdf_bytes(content, args.sheet_type, team=team)
        elif args.kind == "packet":
            result = parse_packet_pdf_bytes(content)
        else:
            result = parse_nqt_pdf_bytes(content)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
