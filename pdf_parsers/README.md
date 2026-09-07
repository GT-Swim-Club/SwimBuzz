# pdf_parsers dev environment

`pdf-parser-client.ts` shells out to a bare `python3` on `PATH` (see
`pdf_parsers/cli.py`), so the interpreter that runs `pnpm dev:web` must have
`pdfplumber` importable — there's no per-request venv activation.

```bash
python3 -m venv venv
source venv/bin/activate          # keep this shell active while running pnpm dev:web
pip install -r requirements-dev.txt
```

Run the parser test suite (skips automatically if the fixture corpus isn't present):

```bash
pytest pdf_parsers/tests/ -v
```

Fixture PDFs live in the gitignored `fixtures/meet-pdfs/{heat-sheets,meet-packets,psych-sheets,results}/`
folder — ask a maintainer for the corpus if you need to regenerate snapshots. Snapshots
themselves (`pdf_parsers/tests/snapshots/`) are committed and diffable without the PDFs.
