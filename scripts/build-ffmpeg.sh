#!/bin/bash
# Build the media pipeline's ffmpeg from pinned sources (docs/briefs/R1-own-ffmpeg-builds.md):
# our own minimal LGPL build, the same on every system (Luke, 2026-11-23).
#
# It holds:
# - VP9 (libvpx), Opus and MP3 (LAME), the formats courses use, and PNG (zlib) for posters;
# - decoders for the royalty-free formats authors import;
# - no H.264, H.265 or AAC code, and nothing the build machine happens to have
#   (--disable-autodetect: no system codecs such as VideoToolbox or Media Foundation).
#
#   bash scripts/build-ffmpeg.sh mac   <output folder>   on a Mac (Xcode Command Line Tools)
#   bash scripts/build-ffmpeg.sh linux <output folder>   on Linux (build-essential)
#   bash scripts/build-ffmpeg.sh win   <output folder>   on Linux, cross-compiled (mingw-w64)
#
# On a Mac, VEDRAOPUS_MAC_ARCH (arm64 or x86_64) chooses the architecture; an arm64 build on an
# Intel Mac is cross-compiled, and checked by its architecture and links rather than run.
#
# Writes <output>/bin/{ffmpeg,ffprobe} (with the DLLs, for Windows), <output>/lib/ (Linux and
# macOS), LICENSE.txt and SOURCE.txt. VEDRAOPUS_FFMPEG_SOURCES may name a folder of the sources,
# already downloaded.
set -euo pipefail

TARGET=${1:-}
OUT=${2:-}
case "$TARGET" in
  mac | linux | win) ;;
  *)
    echo "usage: build-ffmpeg.sh <mac|linux|win> <output folder>" >&2
    exit 2
    ;;
esac
[ -n "$OUT" ] || { echo "usage: build-ffmpeg.sh <mac|linux|win> <output folder>" >&2; exit 2; }
# As a full path: the build changes into its own folder before writing here, and a relative
# path would then land the build in that folder, deleted at the end (CI passes one).
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)

JOBS=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/vedraopus-ffmpeg-build.XXXXXX")
TOOLS=$WORK/tools
DEPS=$WORK/deps
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$TOOLS" "$DEPS" "$WORK/src"
export PATH="$TOOLS/bin:$PATH"

SOURCES=(
  "ffmpeg-8.1.3.tar.xz https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz 7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3"
  "libvpx-1.15.2.tar.gz https://github.com/webmproject/libvpx/archive/refs/tags/v1.15.2.tar.gz 26fcd3db88045dee380e581862a6ef106f49b74b6396ee95c2993a260b4636aa"
  "opus-1.5.2.tar.gz https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz 65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1"
  "lame-3.100.tar.gz https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e"
  "zlib-1.3.1.tar.gz https://github.com/madler/zlib/releases/download/v1.3.1/zlib-1.3.1.tar.gz 9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23"
  "nasm-2.16.03.tar.xz https://www.nasm.us/pub/nasm/releasebuilds/2.16.03/nasm-2.16.03.tar.xz 1412a1c760bbd05db026b6c0d1657affd6631cd0a63cddb6f73cc6d4aa616148"
  "pkgconf-2.3.0.tar.xz https://distfiles.ariadne.space/pkgconf/pkgconf-2.3.0.tar.xz 3a9080ac51d03615e7c1910a0a2a8df08424892b5f13b0628a204d3fcce0ea8b"
)

sha256() {
  if command -v sha256sum > /dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# What the target needs of the build machine, and how the libraries are compiled for it.
CROSS=""
# A plain word, not an array: macOS's bash 3.2 calls an empty array unbound under set -u.
HOST=""
DEP_CFLAGS="-O2"
# An Apple Silicon build on an Intel Mac (alpha 4): every library and ffmpeg for arm64.
MAC_ARCH=${VEDRAOPUS_MAC_ARCH:-$(uname -m)}
MAC_CROSS=false
case "$TARGET" in
  mac)
    export MACOSX_DEPLOYMENT_TARGET=11.0
    if [ "$MAC_ARCH" = arm64 ] && [ "$(uname -m)" != arm64 ]; then
      MAC_CROSS=true
      DEP_CFLAGS="-O2 -arch arm64"
      HOST="--host=aarch64-apple-darwin"
    fi
    ;;
  linux) DEP_CFLAGS="-O2 -fPIC" ;;
  win)
    CROSS=x86_64-w64-mingw32-
    if ! command -v "${CROSS}gcc" > /dev/null; then
      echo "Building ffmpeg for Windows needs mingw-w64 on this Linux machine: sudo apt install mingw-w64" >&2
      exit 1
    fi
    HOST="--host=x86_64-w64-mingw32"
    ;;
esac

# Each source is downloaded (or taken from VEDRAOPUS_FFMPEG_SOURCES), checked against its
# SHA-256, and unpacked. Nothing is built from a file that does not match.
for entry in "${SOURCES[@]}"; do
  read -r file url sum <<< "$entry"
  if [ -n "${VEDRAOPUS_FFMPEG_SOURCES:-}" ] && [ -f "$VEDRAOPUS_FFMPEG_SOURCES/$file" ]; then
    cp "$VEDRAOPUS_FFMPEG_SOURCES/$file" "$WORK/src/$file"
  else
    echo "Downloading $file …"
    curl -sSfL -o "$WORK/src/$file" "$url"
  fi
  got=$(sha256 "$WORK/src/$file")
  if [ "$got" != "$sum" ]; then
    echo "Checksum mismatch for $file: expected $sum, got $got." >&2
    exit 1
  fi
  tar -xf "$WORK/src/$file" -C "$WORK/src"
done
cd "$WORK/src"

# Quiet steps, with the end of the log shown when one fails.
step() {
  local log=$WORK/$1.log
  shift
  if ! (eval "$@") > "$log" 2>&1; then
    tail -40 "$log" >&2
    exit 1
  fi
}

echo "Building the tools (nasm, pkgconf) for this machine …"
step nasm "cd nasm-2.16.03 && ./configure --prefix='$TOOLS' && make -j$JOBS && make install"
step pkgconf "cd pkgconf-2.3.0 && ./configure --prefix='$TOOLS' --with-pkg-config-dir='$DEPS/lib/pkgconfig' \
  && make -j$JOBS && make install && ln -sf pkgconf '$TOOLS/bin/pkg-config'"
export PKG_CONFIG_PATH="$DEPS/lib/pkgconfig"
export PKG_CONFIG_LIBDIR="$DEPS/lib/pkgconfig"

echo "Building zlib, LAME, Opus and libvpx (static) for $TARGET …"
# The tools above run here; from now on, a cross build compiles for arm64.
$MAC_CROSS && export CC="clang -arch arm64"
if [ "$TARGET" = win ]; then
  step zlib "cd zlib-1.3.1 && make -f win32/Makefile.gcc PREFIX=$CROSS BINARY_PATH='$DEPS/bin' \
    INCLUDE_PATH='$DEPS/include' LIBRARY_PATH='$DEPS/lib' -j$JOBS install"
else
  step zlib "cd zlib-1.3.1 && CFLAGS='$DEP_CFLAGS' ./configure --prefix='$DEPS' --static && make -j$JOBS && make install"
fi
step lame "cd lame-3.100 && CFLAGS='$DEP_CFLAGS' ./configure $HOST --prefix='$DEPS' --disable-shared \
  --enable-static --with-pic --disable-frontend --disable-dependency-tracking && make -j$JOBS && make install"
OPUS_EXTRA=""
[ "$TARGET" = win ] && OPUS_EXTRA="--disable-stack-protector"
step opus "cd opus-1.5.2 && CFLAGS='$DEP_CFLAGS' ./configure $HOST --prefix='$DEPS' --disable-shared \
  --enable-static --with-pic --disable-doc --disable-extra-programs --disable-dependency-tracking $OPUS_EXTRA \
  && make -j$JOBS && make install"
VPX_TARGET=""
[ "$TARGET" = win ] && VPX_TARGET="--target=x86_64-win64-gcc"
$MAC_CROSS && VPX_TARGET="--target=arm64-darwin20-gcc"
step libvpx "cd libvpx-1.15.2 && CROSS=$CROSS ./configure $VPX_TARGET --prefix='$DEPS' --disable-shared \
  --enable-static --enable-pic --disable-examples --disable-tools --disable-docs --disable-unit-tests \
  && make -j$JOBS && make install"

echo "Building ffmpeg (LGPL, shared) for $TARGET …"
PATENTED_DECODERS=h264,hevc,aac,aac_fixed,aac_latm,mpeg4,msmpeg4v1,msmpeg4v2,msmpeg4v3,vc1,vc1image,wmv1,wmv2,wmv3,wmv3image
CONFIGURE=(
  --prefix="$WORK/ffmpeg"
  --enable-shared --disable-static
  --disable-gpl --disable-nonfree
  --disable-autodetect
  --disable-doc --disable-ffplay --disable-debug
  # No capture or output devices (webcams, screens, sound cards); only lavfi, ffmpeg's own
  # generated sources, which the tests use.
  --disable-indevs --enable-indev=lavfi --disable-outdevs
  --enable-zlib --enable-libvpx --enable-libopus --enable-libmp3lame
  --disable-encoder=aac
  --disable-decoder="$PATENTED_DECODERS"
  # The libraries are static, so their own dependencies (-lm and the like) are linked too.
  --pkg-config=pkg-config --pkg-config-flags=--static
  --extra-cflags="-I$DEPS/include"
)
case "$TARGET" in
  mac)
    # configure links CoreFoundation, CoreVideo and CoreMedia into every library even with
    # nothing using them (no VideoToolbox); -dead_strip_dylibs leaves out what is not used.
    CONFIGURE+=(--install-name-dir='@rpath'
      --extra-ldflags="-L$DEPS/lib -Wl,-rpath,@loader_path/../lib -Wl,-dead_strip_dylibs")
    if $MAC_CROSS; then
      CONFIGURE+=(--enable-cross-compile --arch=arm64 --target-os=darwin --cc="clang -arch arm64")
    fi
    ;;
  linux)
    # The programs find the libraries in ../lib, and the libraries each other beside themselves.
    # The readings to survive: configure's own eval (\$ to $), make ($$ to $; twice for the
    # libraries, whose link line make expands once more), and the shell (the quotes keep it
    # from reading $ORIGIN). The script checks the result with readelf.
    CONFIGURE+=(
      --extra-ldflags="-L$DEPS/lib"
      --extra-ldexeflags="-Wl,-rpath,'\\\$\\\$ORIGIN/../lib'"
      --extra-ldsoflags="-Wl,-rpath,'\\\$\\\$\\\$\\\$ORIGIN'"
    )
    ;;
  win)
    # Windows threads for ffmpeg, and the compiler's runtime linked in statically (libvpx uses
    # pthreads): the DLLs need nothing but Windows and each other.
    CONFIGURE+=(
      --cross-prefix="$CROSS" --arch=x86_64 --target-os=mingw32
      --enable-w32threads
      --extra-ldflags="-L$DEPS/lib -static-libgcc -static"
    )
    ;;
esac
step configure "cd ffmpeg-8.1.3 && { ./configure $(printf '%q ' "${CONFIGURE[@]}") \
  || { tail -40 ffbuild/config.log; false; }; }"
step make "cd ffmpeg-8.1.3 && make -j$JOBS && make install"

rm -rf "$OUT"
mkdir -p "$OUT/bin"
case "$TARGET" in
  mac)
    mkdir -p "$OUT/lib"
    cp "$WORK/ffmpeg/bin/ffmpeg" "$WORK/ffmpeg/bin/ffprobe" "$OUT/bin/"
    # The libraries by the names the programs ask for (libavcodec.62.dylib), links followed.
    for lib in "$WORK"/ffmpeg/lib/*.dylib; do
      name=$(basename "$lib")
      if [[ "$name" =~ ^lib[a-z]+\.[0-9]+\.dylib$ ]]; then cp -L "$lib" "$OUT/lib/$name"; fi
    done
    ;;
  linux)
    mkdir -p "$OUT/lib"
    cp "$WORK/ffmpeg/bin/ffmpeg" "$WORK/ffmpeg/bin/ffprobe" "$OUT/bin/"
    for lib in "$WORK"/ffmpeg/lib/*.so.*; do
      name=$(basename "$lib")
      if [[ "$name" =~ ^lib[a-z]+\.so\.[0-9]+$ ]]; then cp -L "$lib" "$OUT/lib/$name"; fi
    done
    ;;
  win)
    cp "$WORK/ffmpeg/bin/ffmpeg.exe" "$WORK/ffmpeg/bin/ffprobe.exe" "$WORK"/ffmpeg/bin/*.dll "$OUT/bin/"
    ;;
esac
cp ffmpeg-8.1.3/COPYING.LGPLv2.1 "$OUT/LICENSE.txt"
{
  echo "ffmpeg 8.1.3 for $TARGET ($([ "$TARGET" = mac ] && echo "$MAC_ARCH" || uname -m)), built from source by scripts/build-ffmpeg.sh on $(uname -s) $(uname -m)."
  echo "LGPL 2.1 or later (LICENSE.txt). Libraries: libvpx 1.15.2 (BSD), Opus 1.5.2 (BSD), LAME 3.100 (LGPL), zlib 1.3.1 (zlib)."
  echo "No H.264, H.265 or AAC; nothing of the build machine's own (configured with --disable-autodetect)."
  echo "Sources (nasm and pkgconf are tools for the build, not part of it):"
  for entry in "${SOURCES[@]}"; do
    read -r file url sum <<< "$entry"
    echo "  $url  SHA-256 $sum"
  done
} > "$OUT/SOURCE.txt"

# The build must load only what it should, run, and make what courses use.
EXE=""
[ "$TARGET" = win ] && EXE=".exe"
if [ "$TARGET" = win ]; then
  # Windows' own DLLs, and ours (avcodec-62.dll and the like); never a compiler runtime.
  imports=$(for f in "$OUT"/bin/*.exe "$OUT"/bin/*.dll; do "${CROSS}objdump" -p "$f" | sed -n 's/^\s*DLL Name: //p'; done | sort -u)
  unexpected=$(grep -viE '^(av[a-z]+|sw[a-z]+|postproc)-[0-9]+\.dll$|^(kernel32|user32|advapi32|bcrypt|ole32|oleaut32|shell32|shlwapi|ws2_32|secur32|psapi|gdi32|msvcrt)\.dll$|^api-ms-win-' <<< "$imports" || true)
  if [ -n "$unexpected" ]; then
    echo "The Windows build loads DLLs it should not need:" >&2
    echo "$unexpected" >&2
    exit 1
  fi
elif [ "$TARGET" = mac ]; then
  # Our own libraries and the system library; no framework.
  unexpected=$(for f in "$OUT"/bin/* "$OUT"/lib/*.dylib; do otool -L "$f" | tail -n +2; done \
    | grep -vE '@rpath/lib[a-z]+\.[0-9]+\.dylib|/usr/lib/libSystem\.B\.dylib|/usr/lib/libz\.1\.dylib' || true)
  if [ -n "$unexpected" ]; then
    echo "The macOS build links what it should not need:" >&2
    echo "$unexpected" | sort -u >&2
    exit 1
  fi
elif [ "$TARGET" = linux ]; then
  if ! readelf -d "$OUT/bin/ffmpeg" | grep -qF '[$ORIGIN/../lib]' \
    || ! readelf -d "$OUT/lib/libavcodec.so."* | grep -qF '[$ORIGIN]'; then
    echo "The Linux build does not look for its libraries beside itself:" >&2
    readelf -d "$OUT/bin/ffmpeg" | grep -iE 'rpath|runpath' >&2
    exit 1
  fi
  if ldd "$OUT/bin/ffmpeg" "$OUT/bin/ffprobe" | grep -q 'not found'; then
    ldd "$OUT/bin/ffmpeg" >&2
    exit 1
  fi
fi

run_check=true
if [ "$TARGET" = win ] && ! (cd "$WORK" && "$OUT/bin/ffmpeg.exe" -hide_banner -version > /dev/null 2>&1); then
  echo "(The Windows build cannot be run here, so it was not tried: run it on Windows to check it.)"
  run_check=false
fi
if $MAC_CROSS; then
  # Every program and library for Apple Silicon, and nothing else.
  wrong=$(for f in "$OUT"/bin/* "$OUT"/lib/*.dylib; do
    [ "$(lipo -archs "$f")" = arm64 ] || echo "$f: $(lipo -archs "$f")"
  done)
  if [ -n "$wrong" ]; then
    echo "The Apple Silicon build has files for another architecture:" >&2
    echo "$wrong" >&2
    exit 1
  fi
  echo "(The Apple Silicon build cannot be run on this Intel Mac, so it was not tried: run it on one to check it.)"
  run_check=false
fi
if $run_check; then
  ff="$OUT/bin/ffmpeg$EXE"
  cd "$WORK"
  "$ff" -hide_banner -loglevel error -f lavfi -i testsrc=size=160x90:rate=10:duration=1 \
    -f lavfi -i sine=frequency=440:duration=1 -c:v libvpx-vp9 -c:a libopus -shortest check.webm
  "$ff" -hide_banner -loglevel error -f lavfi -i sine=frequency=440:duration=1 -c:a libmp3lame check.mp3
  "$ff" -hide_banner -loglevel error -f lavfi -i testsrc=size=160x90 -frames:v 1 check.png
  "$OUT/bin/ffprobe$EXE" -v error -show_entries stream=codec_name -of csv=p=0 check.webm
  if "$ff" -hide_banner -decoders 2>/dev/null | grep -qE ' (h264|hevc|aac) '; then
    echo "The build has a patented decoder (H.264, H.265 or AAC)." >&2
    exit 1
  fi
  if "$ff" -hide_banner -encoders 2>/dev/null | grep -qE ' (aac|libopenh264|h264[a-z_]*) '; then
    echo "The build has a patented encoder." >&2
    exit 1
  fi
fi
echo "ffmpeg for $TARGET is in $OUT."
