#!/usr/bin/env bash

set -euo pipefail

PULSE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$PULSE_ROOT/.runtime"
GATEWAY_DIR="$PULSE_ROOT/gateway"
GATEWAY_DOWNLOAD_URL="${PULSE_GATEWAY_DOWNLOAD_URL:-http://download2.interactivebrokers.com/portal/clientportal.gw.zip}"

log() {
  printf '%s\n' "$*"
}

resolve_python() {
  if [ -n "${PULSE_OPENBB_PYTHON:-}" ] && command -v "${PULSE_OPENBB_PYTHON}" >/dev/null 2>&1; then
    printf '%s\n' "${PULSE_OPENBB_PYTHON}"
    return 0
  fi

  if command -v python3.12 >/dev/null 2>&1; then
    printf '%s\n' "python3.12"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return 0
  fi

  return 1
}

ensure_node_modules() {
  if [ -d "$PULSE_ROOT/node_modules" ]; then
    log "npm dependencies already installed"
    return 0
  fi

  log "Installing npm dependencies..."
  (
    cd "$PULSE_ROOT"
    npm install
  )
}

install_gateway_bundle() {
  if [ -x "$GATEWAY_DIR/bin/run.sh" ] && [ "${PULSE_REINSTALL_GATEWAY:-0}" != "1" ]; then
    log "IBKR gateway bundle already present at $GATEWAY_DIR"
    return 0
  fi

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  log "Downloading IBKR Client Portal Gateway..."
  curl -L --fail "$GATEWAY_DOWNLOAD_URL" -o "$tmpdir/clientportal.gw.zip"

  log "Extracting gateway bundle..."
  unzip -oq "$tmpdir/clientportal.gw.zip" -d "$tmpdir/unpacked"

  local source_root
  source_root="$(find "$tmpdir/unpacked" -type f -path '*/bin/run.sh' -print | head -n 1 | xargs -I{} dirname "{}" | xargs -I{} dirname "{}")"

  if [ -z "$source_root" ] || [ ! -x "$source_root/bin/run.sh" ]; then
    log "Could not locate bin/run.sh in downloaded gateway bundle"
    exit 1
  fi

  rm -rf "$GATEWAY_DIR"
  mkdir -p "$GATEWAY_DIR"
  cp -R "$source_root"/. "$GATEWAY_DIR"/

  log "Gateway installed to $GATEWAY_DIR"
}

ensure_openbb_runtime() {
  local py
  if ! py="$(resolve_python)"; then
    log "Python 3 was not found. Skipping OpenBB venv setup."
    return 0
  fi

  mkdir -p "$RUNTIME_DIR"

  if [ ! -x "$RUNTIME_DIR/openbb-venv/bin/python" ]; then
    log "Creating OpenBB virtualenv with $py..."
    "$py" -m venv "$RUNTIME_DIR/openbb-venv"
  fi

  log "Installing OpenBB into .runtime/openbb-venv..."
  "$RUNTIME_DIR/openbb-venv/bin/python" -m pip install --upgrade pip
  "$RUNTIME_DIR/openbb-venv/bin/python" -m pip install --upgrade openbb certifi
}

print_next_steps() {
  cat <<EOF

Setup complete.

Next steps:
  1. Copy env.example to .env.local and fill in IBKR_ACCOUNT_ID if needed
  2. Optional: add the launcher to your PATH
     ln -sf "$PULSE_ROOT/pulse" "\$HOME/bin/pulse"
  3. Start the full stack
     ./pulse dev

The launcher starts:
  - IBKR Client Portal Gateway on :5050
  - gateway keepalive
  - IBKR live-feed daemon
  - OpenBB sidecar
  - Next.js app on :5001
EOF
}

"$PULSE_ROOT/install-java.sh"
ensure_node_modules
install_gateway_bundle
ensure_openbb_runtime
print_next_steps
