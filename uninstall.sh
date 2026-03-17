#!/bin/sh
set -e

BINARY="caflip"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
TARGET="${INSTALL_DIR}/${BINARY}"

if [ ! -e "$TARGET" ]; then
  echo "${BINARY} is not installed at ${TARGET}"
  exit 0
fi

if [ -w "$TARGET" ] || [ -w "$INSTALL_DIR" ]; then
  rm -f "$TARGET"
else
  echo "Need sudo to remove ${TARGET}"
  sudo rm -f "$TARGET"
fi

echo "Removed ${TARGET}"
