const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createPatcher } = require('./patcher');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4166);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/api/status') {
      await sendJson(response, {
        ok: true,
        app: 'Codex CN++',
        codexHome: path.join(process.env.HOME || '', '.codex'),
      });
      return;
    }
    if (request.url === '/api/scan' && request.method === 'POST') {
      await sendJson(response, await createPatcher().scan());
      return;
    }
    if (request.url === '/api/apply' && request.method === 'POST') {
      await sendJson(response, await createPatcher().apply());
      return;
    }
    if (request.url === '/api/dry-run' && request.method === 'POST') {
      await sendJson(response, await createPatcher().apply({ dryRun: true }));
      return;
    }
    if (request.url === '/api/restore' && request.method === 'POST') {
      const body = await readJson(request);
      await sendJson(response, await createPatcher().restore({ batchId: body.batchId }));
      return;
    }
    if (request.url === '/api/backups') {
      await sendJson(response, await createPatcher().listBackups());
      return;
    }
    await sendStatic(request, response);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error.message }, null, 2));
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Codex CN++ running at http://${HOST}:${PORT}\n`);
});

async function sendJson(response, data) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data, null, 2));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function sendStatic(request, response) {
  const requestPath = new URL(request.url, 'http://localhost').pathname;
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
  response.end(fs.readFileSync(filePath));
}
