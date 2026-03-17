#!/usr/bin/env bash
set -euo pipefail

# bundle-sidecar.sh
# Downloads the correct Node.js 22 LTS binary for the current platform,
# places it in src-tauri/binaries/ with the Tauri sidecar naming convention,
# then builds the Next.js standalone output and assembles the bundle.

NODE_VERSION="v22.16.0"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARIES_DIR="$REPO_ROOT/src-tauri/binaries"

# SHA256 checksums from https://nodejs.org/dist/v22.16.0/SHASUMS256.txt
declare -A NODE_CHECKSUMS=(
  ["linux-x64"]="d5b290e61a03e37116ea548af498ed26aaf239e4de6e5b55d5e0e4dba3e36b54"
  ["linux-arm64"]="d3e07e2c3de05ae72b2e03e0d61b9764a3044b1c6e579e1fdf714668dc3fa9da"
  ["darwin-x64"]="c612be3d205e1e46203dbcda66be4740ca4a93e30c95a64b8f2a41a15e811dc6"
  ["darwin-arm64"]="eb1f4e2be05c48ad2e5b72c27dceab0a5fc71076bfccf6dd78ddbd204d683f70"
  ["win-x64"]="a1bbc825ddee2d1e3e0e85b9ccbb1394f7ae7b519538adcd3cb0ef7cb2e1f21f"
)

verify_checksum() {
  local file="$1" expected="$2"
  local actual
  if command -v sha256sum &>/dev/null; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum &>/dev/null; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  else
    echo "Error: No sha256sum or shasum found — cannot verify checksum, aborting" >&2
    return 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "Error: SHA256 checksum mismatch for $file" >&2
    echo "  Expected: $expected" >&2
    echo "  Actual:   $actual" >&2
    rm -f "$file"
    return 1
  fi
  echo "  SHA256 checksum verified."
}

# ─── 1. Detect platform and map to Rust target triple + Node.js platform ────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    case "$ARCH" in
      x86_64)
        RUST_TARGET="x86_64-unknown-linux-gnu"
        NODE_PLATFORM="linux-x64"
        ;;
      aarch64)
        RUST_TARGET="aarch64-unknown-linux-gnu"
        NODE_PLATFORM="linux-arm64"
        ;;
      *)
        echo "Error: Unsupported Linux architecture: $ARCH" >&2
        exit 1
        ;;
    esac
    EXT=""
    ;;
  Darwin)
    case "$ARCH" in
      x86_64)
        RUST_TARGET="x86_64-apple-darwin"
        NODE_PLATFORM="darwin-x64"
        ;;
      arm64)
        RUST_TARGET="aarch64-apple-darwin"
        NODE_PLATFORM="darwin-arm64"
        ;;
      *)
        echo "Error: Unsupported macOS architecture: $ARCH" >&2
        exit 1
        ;;
    esac
    EXT=""
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    RUST_TARGET="x86_64-pc-windows-msvc"
    NODE_PLATFORM="win-x64"
    EXT=".exe"
    ;;
  *)
    echo "Error: Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

echo "Platform detected: OS=$OS ARCH=$ARCH"
echo "  Rust target:    $RUST_TARGET"
echo "  Node platform:  $NODE_PLATFORM"

# ─── 2. Download the correct Node.js binary ─────────────────────────────────

SIDECAR_NAME="node-${RUST_TARGET}${EXT}"
SIDECAR_PATH="$BINARIES_DIR/$SIDECAR_NAME"

if [ -f "$SIDECAR_PATH" ]; then
  echo "Node.js sidecar already exists at $SIDECAR_PATH — skipping download."
else
  mkdir -p "$BINARIES_DIR"

  if [ "$EXT" = ".exe" ]; then
    # Windows: download the .zip and extract node.exe
    NODE_ARCHIVE="node-${NODE_VERSION}-${NODE_PLATFORM}.zip"
    NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_ARCHIVE}"
    TMP_DIR="$(mktemp -d)"

    echo "Downloading $NODE_URL ..."
    curl -fsSL -o "$TMP_DIR/$NODE_ARCHIVE" "$NODE_URL"
    verify_checksum "$TMP_DIR/$NODE_ARCHIVE" "${NODE_CHECKSUMS[$NODE_PLATFORM]}"

    echo "Extracting node.exe ..."
    unzip -q -o "$TMP_DIR/$NODE_ARCHIVE" "node-${NODE_VERSION}-${NODE_PLATFORM}/node.exe" -d "$TMP_DIR"
    cp "$TMP_DIR/node-${NODE_VERSION}-${NODE_PLATFORM}/node.exe" "$SIDECAR_PATH"

    rm -rf "$TMP_DIR"
  else
    # Linux / macOS: download the .tar.xz and extract the node binary
    NODE_ARCHIVE="node-${NODE_VERSION}-${NODE_PLATFORM}.tar.xz"
    NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_ARCHIVE}"
    TMP_DIR="$(mktemp -d)"

    echo "Downloading $NODE_URL ..."
    curl -fsSL -o "$TMP_DIR/$NODE_ARCHIVE" "$NODE_URL"
    verify_checksum "$TMP_DIR/$NODE_ARCHIVE" "${NODE_CHECKSUMS[$NODE_PLATFORM]}"

    echo "Extracting node binary ..."
    tar -xJf "$TMP_DIR/$NODE_ARCHIVE" -C "$TMP_DIR" "node-${NODE_VERSION}-${NODE_PLATFORM}/bin/node"
    cp "$TMP_DIR/node-${NODE_VERSION}-${NODE_PLATFORM}/bin/node" "$SIDECAR_PATH"

    rm -rf "$TMP_DIR"
  fi

  chmod +x "$SIDECAR_PATH"
  echo "Node.js binary placed at $SIDECAR_PATH"
fi

# ─── 3. Build the Next.js standalone output ──────────────────────────────────

echo ""
echo "Running npm run build ..."
cd "$REPO_ROOT"
npm run build

# ─── 4. Assemble standalone bundle ──────────────────────────────────────────

STANDALONE_DIR="$REPO_ROOT/.next/standalone"

if [ ! -d "$STANDALONE_DIR" ]; then
  echo "Error: .next/standalone directory not found. Is output: 'standalone' set in next.config?" >&2
  exit 1
fi

# Copy static assets into the standalone output
echo "Copying .next/static into standalone ..."
mkdir -p "$STANDALONE_DIR/.next/static"
cp -r "$REPO_ROOT/.next/static/." "$STANDALONE_DIR/.next/static/"

# Copy public assets into the standalone output
if [ -d "$REPO_ROOT/public" ]; then
  echo "Copying public/ into standalone ..."
  mkdir -p "$STANDALONE_DIR/public"
  cp -r "$REPO_ROOT/public/." "$STANDALONE_DIR/public/"
else
  echo "Warning: public/ directory not found — skipping."
fi

echo ""
echo "Sidecar bundle complete."
echo "  Node.js sidecar: $SIDECAR_PATH"
echo "  Standalone app:  $STANDALONE_DIR"
