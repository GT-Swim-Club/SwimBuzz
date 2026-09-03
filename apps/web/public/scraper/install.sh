#!/usr/bin/env bash
# SwimBuzz Run scraper — one-time installer (no repo clone required).
# Usage: curl -fsSL https://YOUR_APP/scraper/install.sh | bash -s -- https://YOUR_APP

set -euo pipefail

APP_URL="${1:-${SWIMBUZZ_URL:-}}"
if [[ -z "$APP_URL" ]]; then
  echo "SwimBuzz scraper installer"
  echo ""
  echo "Usage:"
  echo "  curl -fsSL https://swimbuzz.gtswimclub.com/scraper/install.sh | bash -s -- https://swimbuzz.gtswimclub.com"
  exit 1
fi

APP_URL="${APP_URL%/}"
SCRAPER_DIR="${SWIMBUZZ_SCRAPER_DIR:-$HOME/.swimbuzz-scraper}"
BIN_DIR="${HOME}/.local/bin"
VENV_DIR="$SCRAPER_DIR/.venv"

ensure_uv() {
  export PATH="$HOME/.local/bin:$PATH"
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing uv (downloads a working Python — avoids broken Homebrew installs)…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  command -v uv >/dev/null 2>&1
}

install_with_uv() {
  ensure_uv || return 1
  echo "Creating scraper environment with uv…"
  rm -rf "$VENV_DIR"
  uv venv "$VENV_DIR" --python 3.12
  uv pip install --python "$VENV_DIR/bin/python" -r "$SCRAPER_DIR/requirements.txt"
  "$VENV_DIR/bin/python" -m playwright install chromium
  echo "Using uv-managed Python 3.12"
}

bootstrap_pip_legacy() {
  local py="$VENV_DIR/bin/python"
  if "$py" -m pip --version >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing pip…"
  curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$SCRAPER_DIR/get-pip.py"
  if ! "$py" "$SCRAPER_DIR/get-pip.py"; then
    rm -f "$SCRAPER_DIR/get-pip.py"
    return 1
  fi
  rm -f "$SCRAPER_DIR/get-pip.py"
}

install_legacy() {
  local py candidates=(
    "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3"
    python3.12 python3.11 python3.13 python3
  )
  for py in "${candidates[@]}"; do
    command -v "$py" >/dev/null 2>&1 || [[ -x "$py" ]] || continue
    echo "Trying $py ($("$py" --version 2>&1))…"
    rm -rf "$VENV_DIR"
    if ! "$py" -m venv --without-pip "$VENV_DIR" 2>/dev/null; then
      continue
    fi
    if bootstrap_pip_legacy && "$VENV_DIR/bin/python" -m pip --version >/dev/null 2>&1; then
      echo "Using $py"
      # shellcheck disable=SC1091
      source "$VENV_DIR/bin/activate"
      python -m pip install -q --upgrade pip
      python -m pip install -q -r "$SCRAPER_DIR/requirements.txt"
      python -m playwright install chromium
      return 0
    fi
  done
  return 1
}

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required."
  exit 1
fi

mkdir -p "$SCRAPER_DIR" "$BIN_DIR"

echo "Installing SwimBuzz scraper to $SCRAPER_DIR ..."

for file in scraper.py swimcloud_scrape.py swimphone_parse.py swim_common.py requirements.txt; do
  curl -fsSL "$APP_URL/scraper/$file" -o "$SCRAPER_DIR/$file"
done

sync_deps() {
  echo "Installing / updating Python packages…"
  if command -v uv >/dev/null 2>&1 || [[ -x "$HOME/.local/bin/uv" ]]; then
    export PATH="$HOME/.local/bin:$PATH"
    uv pip install --python "$VENV_DIR/bin/python" -r "$SCRAPER_DIR/requirements.txt"
  else
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
    python -m pip install -q --upgrade pip
    python -m pip install -q -r "$SCRAPER_DIR/requirements.txt"
  fi
  "$VENV_DIR/bin/python" -c "import pdfplumber, httpx, playwright" >/dev/null
}

if [[ ! -x "$VENV_DIR/bin/python" ]] || ! "$VENV_DIR/bin/python" -c "import httpx" 2>/dev/null; then
  if ! install_with_uv; then
    echo ""
    echo "uv install failed; trying system Python…"
    if ! install_legacy; then
      echo ""
      echo "Could not set up Python."
      echo ""
      echo "Your Homebrew Python may be broken (pyexpat/libexpat). Fix with:"
      echo "  brew reinstall expat python@3.12"
      echo ""
      echo "Or install Python from https://www.python.org/downloads/ and rerun."
      exit 1
    fi
  fi
else
  sync_deps
fi

# Ensure PDF parsing deps are present even after a partial older install
if ! "$VENV_DIR/bin/python" -c "import pdfplumber" 2>/dev/null; then
  echo "pdfplumber missing — reinstalling packages…"
  sync_deps
fi

cat > "$BIN_DIR/swimbuzz-scraper" <<EOF
#!/usr/bin/env bash
export PLAYWRIGHT_HEADLESS=false
exec "$VENV_DIR/bin/python" "$SCRAPER_DIR/scraper.py" "\$@"
EOF
chmod +x "$BIN_DIR/swimbuzz-scraper"

echo ""
echo "Done! Then run:"
echo "  ~/.local/bin/swimbuzz-scraper --url $APP_URL --code YOUR_CODE"
echo ""
echo "Generate a run command in the app under Run scraper."
