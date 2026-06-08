const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'Codex CN++';
const EXECUTABLE_NAME = 'CodexCNPlusPlus';
const DEFAULT_PORT = '4166';

function buildMacosApp(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.join(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot || path.join(projectRoot, 'dist'));
  const appPath = path.join(outputRoot, `${APP_NAME}.app`);
  const contentsPath = path.join(appPath, 'Contents');
  const macosPath = path.join(contentsPath, 'MacOS');
  const resourcesPath = path.join(contentsPath, 'Resources');
  const executablePath = path.join(macosPath, EXECUTABLE_NAME);

  fs.rmSync(appPath, { recursive: true, force: true });
  fs.mkdirSync(macosPath, { recursive: true });
  fs.mkdirSync(resourcesPath, { recursive: true });

  fs.writeFileSync(path.join(contentsPath, 'Info.plist'), createInfoPlist(), 'utf8');
  fs.writeFileSync(executablePath, createLauncherScript(projectRoot), 'utf8');
  fs.chmodSync(executablePath, 0o755);
  fs.writeFileSync(path.join(resourcesPath, 'README.txt'), [
    'Codex CN++',
    '',
    'Double-click this app to start the local Codex CN++ server and open the browser UI.',
    'Logs are written to ~/Library/Logs/Codex CN++/.',
    '',
  ].join('\n'), 'utf8');

  return {
    appPath,
    executablePath,
  };
}

function createInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${escapeXml(APP_NAME)}</string>
  <key>CFBundleDisplayName</key>
  <string>${escapeXml(APP_NAME)}</string>
  <key>CFBundleIdentifier</key>
  <string>local.codex-cn-plus-plus.launcher</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleExecutable</key>
  <string>${EXECUTABLE_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
</dict>
</plist>
`;
}

function createLauncherScript(projectRoot) {
  const quotedProjectRoot = shellQuote(projectRoot);
  return `#!/bin/zsh
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_ROOT=${quotedProjectRoot}
PORT="\${PORT:-${DEFAULT_PORT}}"
URL="http://127.0.0.1:\${PORT}/"
STATUS_URL="\${URL}api/status"
LOG_DIR="$HOME/Library/Logs/Codex CN++"
LOG_FILE="\${LOG_DIR}/server.log"
PID_FILE="\${LOG_DIR}/server.pid"

mkdir -p "$LOG_DIR"

if curl -fsS "$STATUS_URL" >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  osascript -e 'display dialog "Codex CN++ 需要 Node.js 20 或更新版本。请先安装 Node.js，然后再打开此 App。" buttons {"好"} default button "好" with title "Codex CN++"'
  exit 1
fi

cd "$PROJECT_ROOT" || exit 1

nohup "$NODE_BIN" src/server.js >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

for _ in {1..40}; do
  if curl -fsS "$STATUS_URL" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  fi
  sleep 0.25
done

open "$URL"
osascript -e 'display notification "已尝试启动本地服务；如果页面没有打开，请查看 ~/Library/Logs/Codex CN++/server.log" with title "Codex CN++"'
exit 0
`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  buildMacosApp,
};
