#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$ROOT_DIR/scripts/build-menubar-app.sh"
rm -rf "/Applications/Codex CN++.app"
cp -R "$ROOT_DIR/dist/Codex CN++.app" "/Applications/Codex CN++.app"
echo "[Codex CN++] 已安装：/Applications/Codex CN++.app"
