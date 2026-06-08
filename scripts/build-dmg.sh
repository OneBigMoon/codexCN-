#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('./package.json').version")"
OUTPUT_DIR="$ROOT_DIR/dist"
STAGE_DIR="$OUTPUT_DIR/stage"
APP_PATH="$OUTPUT_DIR/Codex CN++.app"
DMG_PATH="$OUTPUT_DIR/CodexCNPlusPlus-macos-${VERSION}.dmg"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-dmg 仅支持在 macOS 上运行。" >&2
  exit 1
fi

if ! command -v hdiutil >/dev/null 2>&1; then
  echo "未检测到 hdiutil，无法生成 DMG。" >&2
  exit 1
fi

bash "$ROOT_DIR/scripts/build-menubar-app.sh"

rm -rf "$STAGE_DIR" "$DMG_PATH"
mkdir -p "$STAGE_DIR"
cp -R "$APP_PATH" "$STAGE_DIR/Codex CN++.app"
ln -s /Applications "$STAGE_DIR/Applications"
cp "$ROOT_DIR/README.md" "$STAGE_DIR/README.md"
cat > "$STAGE_DIR/安装说明.txt" <<'EOF'
Codex CN++

推荐使用方式：

1. 将 Codex CN++.app 拖入 Applications。
2. 打开 Codex CN++.app，菜单栏会出现 CN++。
3. 点击“应用汉化”即可重新汉化 Codex 的技能和插件列表。
4. 如果 Codex 更新后又变回英文，再点一次“应用汉化”。

如果 macOS 提示无法验证开发者：

1. 右键点击 Codex CN++.app。
2. 选择“打开”。
3. 再次确认打开。
EOF

hdiutil create \
  -srcfolder "$STAGE_DIR" \
  -volname "Codex CN++" \
  -fs HFS+ \
  -format UDZO \
  "$DMG_PATH"

rm -rf "$STAGE_DIR"
echo "[Codex CN++] 已生成：$DMG_PATH"
