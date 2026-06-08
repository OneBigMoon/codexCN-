#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Codex CN++"
EXECUTABLE_NAME="CodexCNPlusPlus"
APP_DIR="$ROOT_DIR/dist/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
TOOL_DIR="$RESOURCES_DIR/CodexCNPlusPlus"
SOURCE_FILE="$ROOT_DIR/macos/CodexCNMenuBar/CodexCNMenuBar.swift"
INFO_PLIST="$ROOT_DIR/macos/CodexCNMenuBar/Info.plist"
ZIP_FILE="$ROOT_DIR/dist/CodexCNPlusPlus-macos.zip"
MODULE_CACHE_DIR="$ROOT_DIR/dist/swift-module-cache"
ICON_GENERATOR="$ROOT_DIR/scripts/generate-macos-icon.swift"
ICONSET_DIR="$ROOT_DIR/dist/CodexCNPlusPlus.iconset"
ICON_FILE="$RESOURCES_DIR/CodexCNPlusPlus.icns"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-menubar-app 仅支持在 macOS 上运行。" >&2
  exit 1
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo "未检测到 swiftc，无法构建菜单栏 App。" >&2
  exit 1
fi

echo "[Codex CN++] 构建菜单栏应用：$APP_DIR"

rm -rf "$APP_DIR" "$ZIP_FILE"
mkdir -p "$MACOS_DIR" "$TOOL_DIR" "$MODULE_CACHE_DIR"
export CLANG_MODULE_CACHE_PATH="$MODULE_CACHE_DIR"

cp "$INFO_PLIST" "$CONTENTS_DIR/Info.plist"

echo "[Codex CN++] 生成 App 图标"
rm -rf "$ICONSET_DIR"
swift "$ICON_GENERATOR" "$ICONSET_DIR"
iconutil -c icns "$ICONSET_DIR" -o "$ICON_FILE"
rm -rf "$ICONSET_DIR"

swiftc \
  -O \
  -module-cache-path "$MODULE_CACHE_DIR" \
  -framework AppKit \
  -framework Foundation \
  "$SOURCE_FILE" \
  -o "$MACOS_DIR/$EXECUTABLE_NAME"

chmod +x "$MACOS_DIR/$EXECUTABLE_NAME"

mkdir -p "$TOOL_DIR/scripts" "$TOOL_DIR/src" "$TOOL_DIR/public" "$TOOL_DIR/data"
mkdir -p "$TOOL_DIR/assets"
rsync -a --delete "$ROOT_DIR/scripts/" "$TOOL_DIR/scripts/"
rsync -a --delete "$ROOT_DIR/src/" "$TOOL_DIR/src/"
rsync -a --delete "$ROOT_DIR/public/" "$TOOL_DIR/public/"
rsync -a --delete "$ROOT_DIR/data/" "$TOOL_DIR/data/"
rsync -a --delete "$ROOT_DIR/assets/" "$TOOL_DIR/assets/"
cp "$ROOT_DIR/package.json" "$TOOL_DIR/package.json"
cp "$ROOT_DIR/README.md" "$TOOL_DIR/README.md"

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
  mkdir -p "$RESOURCES_DIR/node/bin"
  cp "$NODE_BIN" "$RESOURCES_DIR/node/bin/node"
  chmod +x "$RESOURCES_DIR/node/bin/node"
  echo "[Codex CN++] 已内置 Node 运行时：$NODE_BIN"
else
  echo "[Codex CN++] 未发现 node；App 会尝试使用系统环境中的 node。"
fi

codesign --force --deep --sign - "$APP_DIR" >/dev/null
ditto -c -k --keepParent "$APP_DIR" "$ZIP_FILE"

echo "[Codex CN++] 菜单栏应用已生成：$APP_DIR"
echo "[Codex CN++] 可分发压缩包：$ZIP_FILE"
