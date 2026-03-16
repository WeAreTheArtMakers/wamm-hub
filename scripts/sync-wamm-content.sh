#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${TMPDIR:-/tmp}/wamm-content-sync"
REPO_URL="${WAMM_REPO_URL:-https://github.com/WeAreTheArtMakers/wamm}"

rm -rf "$TMP_DIR"
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMP_DIR"

pushd "$TMP_DIR" >/dev/null
git sparse-checkout init --no-cone
printf "content/artists/**\ncontent/index.json\ncontent/search-index.json\n" > .git/info/sparse-checkout
GIT_LFS_SKIP_SMUDGE=1 GIT_TERMINAL_PROMPT=0 git checkout -f
popd >/dev/null

mkdir -p "$ROOT_DIR/content"
rm -rf "$ROOT_DIR/content/artists"
cp -R "$TMP_DIR/content/artists" "$ROOT_DIR/content/"
cp "$TMP_DIR/content/index.json" "$ROOT_DIR/content/index.json"
cp "$TMP_DIR/content/search-index.json" "$ROOT_DIR/content/search-index.json"

echo "WAMM content synced into $ROOT_DIR/content"
