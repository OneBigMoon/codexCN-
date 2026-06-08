#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || '4166';
const URL = `http://127.0.0.1:${PORT}/`;
const STATUS_URL = `${URL}api/status`;
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'Codex CN++');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const command = process.argv[2] || 'status';

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exit(1);
});

async function main() {
  if (command === 'open-ui') {
    await ensureServer();
    spawn('open', [URL], { detached: true, stdio: 'ignore' }).unref();
    process.stdout.write(`已打开 ${URL}\n`);
    return;
  }
  if (command === 'status') {
    await runCli(['scan']);
    return;
  }
  if (command === 'apply') {
    await runCli(['apply']);
    return;
  }
  if (command === 'restore') {
    await runCli(['restore']);
    return;
  }
  if (command === 'backups') {
    await ensureServer();
    const backups = await requestJson(`${URL}api/backups`);
    process.stdout.write(JSON.stringify(backups, null, 2));
    process.stdout.write('\n');
    return;
  }
  throw new Error(`未知命令：${command}`);
}

async function runCli(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src/cli.js'), ...args], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`命令执行失败：node src/cli.js ${args.join(' ')}`));
    });
  });
}

async function ensureServer() {
  if (await isServerReady()) return;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  for (let index = 0; index < 40; index += 1) {
    if (await isServerReady()) return;
    await sleep(250);
  }
  throw new Error(`本地服务启动超时，请查看日志：${LOG_FILE}`);
}

async function isServerReady() {
  try {
    await requestJson(STATUS_URL);
    return true;
  } catch {
    return false;
  }
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(1000, () => {
      request.destroy(new Error('request timeout'));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
