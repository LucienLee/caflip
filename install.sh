#!/bin/sh
set -e

REPO="LucienLee/caflip"
BINARY="caflip"
INSTALL_DIR="/usr/local/bin"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin|linux) ;;
  *)
    echo "Error: unsupported OS '$OS'. Only macOS and Linux are supported." >&2
    exit 1
    ;;
esac

case "$ARCH" in
  aarch64|arm64) ARCH="arm64" ;;
  x86_64)        ARCH="x64" ;;
  *)
    echo "Error: unsupported architecture '$ARCH'." >&2
    exit 1
    ;;
esac

URL="https://github.com/${REPO}/releases/latest/download/${BINARY}-${OS}-${ARCH}"
TMPFILE=$(mktemp)

echo "Downloading ${BINARY} for ${OS}/${ARCH}..."
if ! curl -fSL -o "$TMPFILE" "$URL"; then
  rm -f "$TMPFILE"
  echo "Error: download failed. Check that a release exists for ${OS}-${ARCH}." >&2
  exit 1
fi

chmod +x "$TMPFILE"

if [ -w "$INSTALL_DIR" ]; then
  mv "$TMPFILE" "${INSTALL_DIR}/${BINARY}"
else
  echo "Need sudo to install to ${INSTALL_DIR}"
  sudo mv "$TMPFILE" "${INSTALL_DIR}/${BINARY}"
fi

echo "Installed ${BINARY} to ${INSTALL_DIR}/${BINARY}"
