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

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install from https://www.python.org/downloads/"
  exit 1
fi

mkdir -p "$BRIDGE_DIR" "$BIN_DIR"

echo "Installing SwimBuzz bridge to $BRIDGE_DIR ..."

for file in bridge.py swimcloud_scrape.py requirements.txt; do
  curl -fsSL "$APP_URL/bridge/$file" -o "$BRIDGE_DIR/$file"
done

if [[ ! -d "$BRIDGE_DIR/.venv" ]]; then
  python3 -m venv "$BRIDGE_DIR/.venv"
fi

# shellcheck disable=SC1091
source "$BRIDGE_DIR/.venv/bin/activate"
python -m pip install -q --upgrade pip
python -m pip install -q -r "$BRIDGE_DIR/requirements.txt"
python -m playwright install chromium

cat > "$BIN_DIR/swimbuzz-bridge" <<EOF
#!/usr/bin/env bash
export PLAYWRIGHT_HEADLESS=false
exec "$BRIDGE_DIR/.venv/bin/python" "$BRIDGE_DIR/bridge.py" "\$@"
EOF
chmod +x "$BIN_DIR/swimbuzz-bridge"

echo ""
echo "Done! Add ~/.local/bin to your PATH if needed, then run:"
echo "  swimbuzz-bridge --url $APP_URL --code YOUR_CODE"
echo ""
echo "Generate a code in the app under Local sync."
