#!/bin/bash
# Build vo-decode, our helper that reads media through the operating system's own licensed
# decoders (docs/briefs/R3-os-decoders.md): Media Foundation on Windows, AVFoundation on macOS.
#
#   bash scripts/build-decoder.sh win <bin folder>   on Linux, cross-compiled (mingw-w64)
#   bash scripts/build-decoder.sh mac <bin folder>   on a Mac (Xcode Command Line Tools)
#
# Writes <bin folder>/vo-decode(.exe), beside our ffmpeg.
set -euo pipefail

TARGET=${1:-}
OUT=${2:-}
[ -n "$TARGET" ] && [ -n "$OUT" ] || { echo "usage: build-decoder.sh <mac|win> <bin folder>" >&2; exit 2; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=$ROOT/apps/desktop/native/decoder
mkdir -p "$OUT"

case "$TARGET" in
  win)
    CC=x86_64-w64-mingw32-gcc
    command -v "$CC" > /dev/null || { echo "Building vo-decode for Windows needs mingw-w64: sudo apt install mingw-w64" >&2; exit 1; }
    "$CC" -O2 -Wall -Wextra -municode -static-libgcc -static -o "$OUT/vo-decode.exe" "$SRC/windows/decoder.c" \
      -lmfplat -lmfreadwrite -lmfuuid -lole32 -luuid
    # Windows' own DLLs only, never a compiler runtime.
    imports=$(x86_64-w64-mingw32-objdump -p "$OUT/vo-decode.exe" | sed -n 's/^\s*DLL Name: //p' | sort -u)
    unexpected=$(grep -viE '^(kernel32|ole32|mfplat|mfreadwrite|msvcrt|user32|advapi32)\.dll$|^api-ms-win-' <<< "$imports" || true)
    if [ -n "$unexpected" ]; then
      echo "vo-decode.exe loads DLLs it should not need:" >&2
      echo "$unexpected" >&2
      exit 1
    fi
    ;;
  mac)
    command -v swiftc > /dev/null || { echo "Building vo-decode on macOS needs the Xcode Command Line Tools: xcode-select --install" >&2; exit 1; }
    # VEDRAOPUS_MAC_ARCH (arm64 or x86_64) chooses the architecture; this Mac's by default.
    MAC_ARCH=${VEDRAOPUS_MAC_ARCH:-$(uname -m)}
    MACOSX_DEPLOYMENT_TARGET=11.0 swiftc -O -target "$MAC_ARCH-apple-macos11" \
      -o "$OUT/vo-decode" "$SRC/macos/main.swift"
    [ "$(lipo -archs "$OUT/vo-decode")" = "$MAC_ARCH" ] || { echo "vo-decode is not for $MAC_ARCH" >&2; exit 1; }
    ;;
  *)
    echo "usage: build-decoder.sh <mac|win> <bin folder>" >&2
    exit 2
    ;;
esac
echo "vo-decode for $TARGET is in $OUT."
