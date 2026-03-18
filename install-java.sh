#!/usr/bin/env bash

set -euo pipefail

JAVA_CASK="${PULSE_JAVA_CASK:-temurin}"

log() {
  printf '%s\n' "$*"
}

if command -v java >/dev/null 2>&1; then
  log "Java already installed:"
  java -version
  exit 0
fi

if [ "$(uname -s)" != "Darwin" ]; then
  log "Java is not installed."
  log "Install Java 11+ manually, then rerun setup-local.sh."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  log "Homebrew is required to install Java automatically on macOS."
  log "Install Homebrew first: https://brew.sh"
  exit 1
fi

log "Installing Java via Homebrew cask: $JAVA_CASK"
brew install --cask "$JAVA_CASK"

log "Java installed:"
java -version
