#!/usr/bin/env bash
# SwimBuzz local sync bridge — one-time installer (no repo clone required).
# Usage: curl -fsSL https://YOUR_APP/bridge/install.sh | bash -s -- https://YOUR_APP

set -euo pipefail

APP_URL="${1:-${SWIMBUZZ_URL:-}}"
if [[ -z "$APP_URL" ]]; then
  echo "SwimBuzz bridge installer"
  echo ""
  echo "Usage:"
  echo "  curl -fsSL https://swimbuzz.onrender.com/bridge/install.sh | bash -s -- https://swimbuzz.onrender.com"
  exit 1
fi

APP_URL="${APP_URL%/}"
BRIDGE_DIR="${SWIMBUZZ_BRIDGE_DIR:-$HOME/.swimbuzz-bridge}"
BIN_DIR="${HOME}/.local/bin"
VENV_DIR="$BRIDGE_DIR/.venv"

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
  echo "Creating bridge environment with uv…"
  rm -rf "$VENV_DIR"
  uv venv "$VENV_DIR" --python 3.12
  uv pip install --python "$VENV_DIR/bin/python" -r "$BRIDGE_DIR/requirements.txt"
  "$VENV_DIR/bin/python" -m playwright install chromium
  echo "Using uv-managed Python 3.12"
}

bootstrap_pip_legacy() {
  local py="$VENV_DIR/bin/python"
  if "$py" -m pip --version >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing pip…"
  curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$BRIDGE_DIR/get-pip.py"
  if ! "$py" "$BRIDGE_DIR/get-pip.py"; then
    rm -f "$BRIDGE_DIR/get-pip.py"
    return 1
  fi
  rm -f "$BRIDGE_DIR/get-pip.py"
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
      python -m pip install -q -r "$BRIDGE_DIR/requirements.txt"
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

mkdir -p "$BRIDGE_DIR" "$BIN_DIR"

echo "Installing SwimBuzz bridge to $BRIDGE_DIR ..."

for file in bridge.py swimcloud_scrape.py swimphone_parse.py pdf_parse.py packet_parse.py sheet_parse.py requirements.txt; do
  curl -fsSL "$APP_URL/bridge/$file" -o "$BRIDGE_DIR/$file"
done

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
fi

cat > "$BIN_DIR/swimbuzz-bridge" <<EOF
#!/usr/bin/env bash
export PLAYWRIGHT_HEADLESS=false
exec "$VENV_DIR/bin/python" "$BRIDGE_DIR/bridge.py" "\$@"
EOF
chmod +x "$BIN_DIR/swimbuzz-bridge"

echo ""
echo "Done! Then run:"
echo "  ~/.local/bin/swimbuzz-bridge --url $APP_URL --code YOUR_CODE"
echo ""
echo "Generate a code in the app under Local sync."
