const buttons = Array.from(document.querySelectorAll('button'));
const report = document.querySelector('#report');
const statusText = document.querySelector('#status');
const backupSelect = document.querySelector('#backupSelect');
const progressPanel = document.querySelector('#progressPanel');
const progressText = document.querySelector('#progressText');
let busyTimer = null;
let codexHomeText = '';

document.querySelector('#scanBtn').addEventListener('click', () => runAction('扫描', '/api/scan'));
document.querySelector('#dryRunBtn').addEventListener('click', () => runAction('预演', '/api/dry-run'));
document.querySelector('#applyBtn').addEventListener('click', async () => {
  await runAction('应用汉化', '/api/apply');
  await loadBackups();
});
document.querySelector('#restoreBtn').addEventListener('click', async () => {
  const batchId = backupSelect.value || undefined;
  await runAction('恢复备份', '/api/restore', { batchId });
  await loadBackups();
});
document.querySelector('#backupsBtn').addEventListener('click', loadBackups);

init();

async function init() {
  const status = await request('/api/status', 'GET');
  codexHomeText = `Codex home: ${status.codexHome}`;
  statusText.textContent = codexHomeText;
  await loadBackups();
}

async function runAction(actionName, url, body) {
  startBusy(actionName);
  try {
    const data = await request(url, 'POST', body);
    renderResult(data, `${actionName}完成`);
    finishBusy(actionName, data);
  } catch (error) {
    finishBusy(actionName, null, error);
    report.textContent = `${actionName}失败\n\n${error.message}`;
  } finally {
    stopBusy();
  }
}

async function loadBackups() {
  const backups = await request('/api/backups', 'GET');
  backupSelect.innerHTML = '';
  if (backups.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无备份';
    backupSelect.appendChild(option);
    return;
  }
  for (const backup of backups) {
    const option = document.createElement('option');
    option.value = backup.id;
    option.textContent = `${backup.createdAt} · ${backup.files} 个文件`;
    backupSelect.appendChild(option);
  }
}

async function request(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}

function renderResult(data, title = '结果') {
  const files = data.files || [];
  const changedFiles = data.changedFiles || [];
  document.querySelector('#filesCount').textContent = String(files.length || changedFiles.length || data.restoredFiles?.length || 0);
  document.querySelector('#matchedCount').textContent = String(data.matchedFiles || 0);
  document.querySelector('#matchesCount').textContent = String(data.matches || 0);
  document.querySelector('#changesCount').textContent = String(changedFiles.length || data.restoredFiles?.length || 0);
  report.textContent = `${title}\n${buildSummary(data)}\n\n${JSON.stringify(data, null, 2)}`;
}

function startBusy(actionName) {
  const startedAt = Date.now();
  for (const button of buttons) button.disabled = true;
  progressPanel.hidden = false;
  updateBusyText(actionName, 0);
  report.textContent = `${actionName}中...\n\n正在处理技能和插件汉化缓存，请稍等。`;
  busyTimer = window.setInterval(() => {
    updateBusyText(actionName, Math.floor((Date.now() - startedAt) / 1000));
  }, 500);
}

function updateBusyText(actionName, elapsedSeconds) {
  const text = `${actionName}中... 已用 ${elapsedSeconds} 秒`;
  statusText.textContent = text;
  progressText.textContent = `${text}。完成后这里会显示结果摘要。`;
}

function finishBusy(actionName, data, error) {
  if (error) {
    statusText.textContent = `${actionName}失败`;
    progressText.textContent = `${actionName}失败，请查看报告。`;
    return;
  }
  const summary = buildSummary(data);
  statusText.textContent = `${actionName}完成：${summary}`;
  progressText.textContent = `${actionName}完成。${summary}`;
}

function stopBusy() {
  if (busyTimer) {
    window.clearInterval(busyTimer);
    busyTimer = null;
  }
  for (const button of buttons) button.disabled = false;
}

function buildSummary(data) {
  if (!data) return '';
  if (Array.isArray(data.restoredFiles)) {
    return `已恢复 ${data.restoredFiles.length} 个文件。`;
  }
  const changedCount = (data.changedFiles || []).length;
  const matchedCount = data.matchedFiles || 0;
  const matchesCount = data.matches || 0;
  if (data.dryRun) {
    return `预演发现 ${changedCount} 个可改文件。`;
  }
  if (data.backupBatch) {
    return `已修改 ${changedCount} 个文件，备份批次 ${data.backupBatch.id}。`;
  }
  if (changedCount > 0) {
    return `发现 ${changedCount} 个可改文件。`;
  }
  if (matchedCount > 0 || matchesCount > 0) {
    return `命中 ${matchedCount} 个文件、${matchesCount} 条文案。`;
  }
  return '没有需要处理的项目。';
}
