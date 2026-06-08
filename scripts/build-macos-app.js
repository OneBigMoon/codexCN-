#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { buildMacosApp } = require('../src/macosApp');

const projectRoot = path.resolve(__dirname, '..');
const result = buildMacosApp({ projectRoot });

if (process.argv.includes('--install')) {
  const installDir = '/Applications';
  const installPath = path.join(installDir, path.basename(result.appPath));
  fs.rmSync(installPath, { recursive: true, force: true });
  fs.cpSync(result.appPath, installPath, { recursive: true });
  process.stdout.write(`Installed ${installPath}\n`);
} else {
  process.stdout.write(`Built ${result.appPath}\n`);
}
