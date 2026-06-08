const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CODEX_HOME = path.join(process.env.HOME || '', '.codex');
const DEFAULT_APP_ARCHIVE = '/Applications/Codex.app/Contents/Resources/app.asar';
const SUPPORTED_BASENAMES = new Set(['plugin.json', 'SKILL.md', 'openai.yaml', 'skills-curated-cache.json']);
const SKIP_KEYS = new Set([
  'name',
  'id',
  'slug',
  'version',
  'homepage',
  'repository',
  'license',
  'websiteURL',
  'privacyPolicyURL',
  'termsOfServiceURL',
  'composerIcon',
  'logo',
  'brandColor',
  'email',
  'url',
]);
const FRONTEND_BYTE_PATCHES = [
  ['title:`Featured`', 'title:`推荐  `'],
  ['Data Analytics', '数据分析  '],
  ['Product Design', '产品设计  '],
  ['Creative Production', '创意制作       '],
  ['Investment Banking', '投资银行      '],
  ['Public Equity Investing', '公开股票投资     '],
  ['Create and edit spreadsheet files', '创建和编辑电子表格文件'],
  ['Create and edit presentations', '创建和编辑演示文稿  '],
  ['Create and edit document artifacts', '创建和编辑文档产物       '],
  ['Turn data into clear decisions', '把数据转化为清晰决策'],
  ['Explore and prototype ideas', '探索并原型化想法   '],
  ['Design and prototype better flows', '设计原型化流程            '],
  ['Create polished campaign visuals', '创建精美营销视觉        '],
  ['Build deal materials faster', '更快制作交易材料   '],
  ['Execute deals with confidence', '自信执行交易           '],
];

function loadTranslations(filePath = path.join(__dirname, '..', 'data', 'translations.json')) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadSidecars(filePath = path.join(__dirname, '..', 'data', 'sidecars.json')) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createPatcher(options = {}) {
  const codexHome = path.resolve(options.codexHome || DEFAULT_CODEX_HOME);
  const projectRoot = path.resolve(options.projectRoot || path.join(__dirname, '..'));
  const translations = options.translations || loadTranslations();
  const sidecars = options.sidecars || loadSidecars();
  const strings = translations.strings || {};
  const scanRoots = options.scanRoots || [
    '.tmp/plugins',
    '.tmp/bundled-marketplaces',
    'plugins/cache',
    'vendor_imports',
    'skills',
    'superpowers',
  ];
  const extraRoots = options.extraRoots || [
    path.join(process.env.HOME || '', '.cc-switch', 'skills'),
  ];
  const appArchivePaths = Object.prototype.hasOwnProperty.call(options, 'appArchivePaths')
    ? options.appArchivePaths
    : (codexHome === path.resolve(DEFAULT_CODEX_HOME) ? [DEFAULT_APP_ARCHIVE] : []);
  const allowedAppArchiveRoots = options.allowedAppArchiveRoots || [
    path.dirname(DEFAULT_APP_ARCHIVE),
  ];
  const allowedRestoreRoots = [
    codexHome,
    ...extraRoots.map((root) => path.resolve(root)),
    ...allowedAppArchiveRoots.map((root) => path.resolve(root)),
  ];

  async function scan() {
    const files = findSupportedFiles(codexHome, scanRoots, extraRoots, appArchivePaths);
    const reports = files.map((filePath) => analyzeFile(filePath, strings));
    reports.push(...findMissingSidecars(files, sidecars));
    return summarizeReports(reports);
  }

  async function apply({ dryRun = false } = {}) {
    const files = findSupportedFiles(codexHome, scanRoots, extraRoots, appArchivePaths);
    const reports = [
      ...files.map((filePath) => analyzeFile(filePath, strings)),
      ...findMissingSidecars(files, sidecars),
    ].filter((report) => report.changed);
    if (dryRun || reports.length === 0) {
      return {
        dryRun,
        changedFiles: reports.map(toPublicChange),
        backupBatch: null,
        notes: buildNotes(reports.length),
      };
    }

    const backupBatch = createBackupBatch(projectRoot, reports);
    for (const report of reports) {
      fs.mkdirSync(path.dirname(report.filePath), { recursive: true });
      if (report.binary) {
        fs.writeFileSync(report.filePath, report.after);
      } else {
        fs.writeFileSync(report.filePath, report.after, 'utf8');
      }
    }
    return {
      dryRun: false,
      changedFiles: reports.map(toPublicChange),
      backupBatch,
      notes: buildNotes(reports.length),
    };
  }

  async function listBackups() {
    const backupRoot = path.join(projectRoot, 'backups');
    if (!fs.existsSync(backupRoot)) return [];
    return fs.readdirSync(backupRoot)
      .map((id) => {
        const manifestPath = path.join(backupRoot, id, 'manifest.json');
        if (!fs.existsSync(manifestPath)) return null;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          return {
            id: manifest.id,
            createdAt: manifest.createdAt,
            files: manifest.files.length,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function restore({ batchId } = {}) {
    const backups = await listBackups();
    const selectedId = batchId || (backups[0] && backups[0].id);
    if (!selectedId) {
      return { restoredFiles: [], backupBatch: null, error: '没有可恢复的备份批次。' };
    }
    const manifestPath = path.join(projectRoot, 'backups', selectedId, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const restoredFiles = [];
    for (const entry of manifest.files) {
      const targetPath = path.resolve(entry.path);
      assertInsideAny(targetPath, allowedRestoreRoots);
      if (entry.existed === false) {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } else {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        if (entry.beforeBase64) {
          fs.writeFileSync(targetPath, Buffer.from(entry.beforeBase64, 'base64'));
        } else {
          fs.writeFileSync(targetPath, entry.before, 'utf8');
        }
      }
      restoredFiles.push(targetPath);
    }
    return {
      restoredFiles,
      backupBatch: {
        id: manifest.id,
        createdAt: manifest.createdAt,
      },
    };
  }

  return { scan, apply, restore, listBackups };
}

function findSupportedFiles(codexHome, scanRoots, extraRoots = [], appArchivePaths = []) {
  const results = [];
  for (const root of scanRoots) {
    const absoluteRoot = path.join(codexHome, root);
    walk(absoluteRoot, results);
  }
  for (const root of extraRoots) {
    walk(path.resolve(root), results);
  }
  for (const archivePath of appArchivePaths) {
    const absoluteArchivePath = path.resolve(archivePath);
    if (fs.existsSync(absoluteArchivePath) && fs.statSync(absoluteArchivePath).isFile()) {
      results.push(absoluteArchivePath);
    }
  }
  return Array.from(new Set(results)).sort();
}

function walk(currentPath, results) {
  if (!fs.existsSync(currentPath)) return;
  const stat = fs.statSync(currentPath);
  if (stat.isDirectory()) {
    const base = path.basename(currentPath);
    if (base === 'node_modules' || base === '.git') return;
    for (const name of fs.readdirSync(currentPath)) {
      walk(path.join(currentPath, name), results);
    }
    return;
  }
  if (!stat.isFile()) return;
  const base = path.basename(currentPath);
  if (SUPPORTED_BASENAMES.has(base)) {
    results.push(currentPath);
  }
}

function analyzeFile(filePath, strings) {
  if (path.basename(filePath) === 'app.asar') {
    return analyzeAppArchive(filePath);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const base = path.basename(filePath);
  const result = base === 'plugin.json' || base === 'skills-curated-cache.json'
    ? patchJson(before, strings)
    : base === 'SKILL.md'
      ? patchSkillMarkdown(before, strings)
      : base === 'openai.yaml'
        ? patchYamlDisplay(before, strings)
        : patchText(before, strings);
  return {
    filePath,
    before,
    after: result.text,
    existed: true,
    changed: before !== result.text,
    matches: result.matches,
    replacements: result.replacements,
  };
}

function analyzeAppArchive(filePath) {
  const before = fs.readFileSync(filePath);
  const result = patchAppArchive(before);
  return {
    filePath,
    before,
    after: result.buffer,
    existed: true,
    changed: !before.equals(result.buffer),
    matches: result.matches,
    replacements: result.replacements,
    binary: true,
  };
}

function findMissingSidecars(files, sidecars) {
  const skillConfig = sidecars.skills || {};
  const skillMarkdownFiles = files.filter((filePath) => path.basename(filePath) === 'SKILL.md');
  const reports = [];
  for (const skillPath of skillMarkdownFiles) {
    const skillName = path.basename(path.dirname(skillPath));
    const config = skillConfig[skillName];
    if (!config) continue;
    const sidecarPath = path.join(path.dirname(skillPath), 'agents', 'openai.yaml');
    if (fs.existsSync(sidecarPath)) continue;
    const after = [
      'interface:',
      `  display_name: "${config.display_name}"`,
      `  short_description: "${config.short_description}"`,
      '',
    ].join('\n');
    reports.push({
      filePath: sidecarPath,
      before: null,
      after,
      existed: false,
      changed: true,
      matches: 1,
      replacements: [{ from: '(missing sidecar)', to: config.display_name }],
    });
  }
  return reports;
}

function patchJson(text, strings) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return patchText(text, strings, false);
  }
  const replacements = [];
  const context = buildJsonPatchContext(data, strings);
  const patched = patchJsonValue(data, strings, replacements, [], context);
  if (replacements.length === 0) {
    return {
      text,
      matches: 0,
      replacements,
    };
  }
  return {
    text: `${JSON.stringify(patched, null, 2)}\n`,
    matches: replacements.length,
    replacements,
  };
}

function patchJsonValue(value, strings, replacements, pathParts, context) {
  if (typeof value === 'string') {
    const key = pathParts[pathParts.length - 1];
    if (SKIP_KEYS.has(key)) return value;
    return translateString(value, strings, replacements, pathParts, context);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => patchJsonValue(item, strings, replacements, pathParts.concat(String(index)), context));
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = patchJsonValue(item, strings, replacements, pathParts.concat(key), context);
    }
    return next;
  }
  return value;
}

function buildJsonPatchContext(data, strings) {
  const rawName = data && typeof data === 'object'
    ? (data.interface && data.interface.displayName) || data.displayName || data.name
    : '';
  const displayName = localizeKnown(rawName || '该插件', strings);
  const rawDescription = data && typeof data === 'object' ? data.description : '';
  const rawShort = data && data.interface && data.interface.shortDescription;
  return {
    displayName,
    description: pickChinese(localizeKnown(rawDescription, strings), localizeKnown(rawShort, strings)),
  };
}

function patchSkillMarkdown(text, strings) {
  const replacements = [];
  const lines = text.split('\n');
  let inFrontmatter = false;
  let skippingBlockValue = false;
  const patchedLines = [];
  lines.forEach((line, index) => {
    if (skippingBlockValue) {
      if (line.trim() === '---') {
        skippingBlockValue = false;
      } else if (line.trim() === '' || /^\s+/.test(line)) {
        return;
      } else {
        skippingBlockValue = false;
      }
    }
    if (index === 0 && line.trim() === '---') {
      inFrontmatter = true;
      patchedLines.push(line);
      return;
    }
    if (inFrontmatter && index > 0 && line.trim() === '---') {
      inFrontmatter = false;
      patchedLines.push(line);
      return;
    }
    if (inFrontmatter && /^name:\s*/.test(line)) {
      patchedLines.push(line);
      return;
    }
    if (inFrontmatter && /^\s*(description|short-description|short_description):\s*[>|]/.test(line)) {
      const fallback = '该技能提供相关工作流与操作指导。';
      replacements.push({ from: line.trim(), to: fallback });
      patchedLines.push(line.replace(/^(\s*[^:]+:\s*).*/, `$1${fallback}`));
      skippingBlockValue = true;
      return;
    }
    if (inFrontmatter && /^\s*(description|short-description|short_description):\s*/.test(line)) {
      patchedLines.push(replaceYamlLineValue(line, strings, replacements));
      return;
    }
    patchedLines.push(line);
  });
  return {
    text: patchedLines.join('\n'),
    matches: replacements.length,
    replacements,
  };
}

function patchYamlDisplay(text, strings) {
  const replacements = [];
  const lines = text.split('\n');
  const patchedLines = lines.map((line) => {
    if (/^\s*(display_name|short_description|short-description|description):\s*/.test(line)) {
      return replaceYamlLineValue(line, strings, replacements);
    }
    return line;
  });
  return {
    text: patchedLines.join('\n'),
    matches: replacements.length,
    replacements,
  };
}

function patchText(text, strings) {
  const replacements = [];
  const next = replaceKnownStrings(text, strings, replacements);
  return {
    text: next,
    matches: replacements.length,
    replacements,
  };
}

function patchAppArchive(buffer) {
  let next = Buffer.from(buffer);
  const replacements = [];
  for (const [from, to] of FRONTEND_BYTE_PATCHES) {
    const fromBuffer = Buffer.from(from, 'utf8');
    const toBuffer = Buffer.from(to, 'utf8');
    if (fromBuffer.length !== toBuffer.length) {
      throw new Error(`Frontend byte patch must keep byte length: ${from}`);
    }
    let index = -1;
    let count = 0;
    while ((index = next.indexOf(fromBuffer, index + 1)) !== -1) {
      toBuffer.copy(next, index);
      count += 1;
    }
    if (count > 0) {
      replacements.push({ from, to, count });
    }
  }
  return {
    buffer: next,
    matches: replacements.reduce((sum, replacement) => sum + replacement.count, 0),
    replacements,
  };
}

function translateString(value, strings, replacements, pathParts = [], context = {}) {
  if (Object.prototype.hasOwnProperty.call(strings, value)) {
    const translated = strings[value];
    if (translated !== value) {
      replacements.push({ from: value, to: translated });
    }
    return translated;
  }
  const fallback = fallbackJsonDisplayString(value, pathParts, context, strings);
  if (fallback && fallback !== value) {
    replacements.push({ from: value, to: fallback });
    return fallback;
  }
  return value;
}

function replaceYamlLineValue(line, strings, replacements) {
  const match = line.match(/^(\s*[^:]+:\s*)(.*?)(\s*)$/);
  if (!match) return line;
  const [, prefix, rawValue, suffix] = match;
  const quote = (rawValue.startsWith('"') && rawValue.endsWith('"'))
    ? '"'
    : (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? "'"
      : '';
  const value = quote ? rawValue.slice(1, -1) : rawValue;
  const key = prefix.toLowerCase();
  const translated = Object.prototype.hasOwnProperty.call(strings, value)
    ? strings[value]
    : fallbackYamlDisplayString(value, key, strings);
  if (translated === value) return line;
  replacements.push({ from: value, to: translated });
  return `${prefix}${quote}${translated}${quote}${suffix}`;
}

function fallbackJsonDisplayString(value, pathParts, context, strings) {
  if (!isEnglishOnly(value)) return null;
  const key = pathParts[pathParts.length - 1];
  const parent = pathParts[pathParts.length - 2];
  if (key === 'displayName' || key === 'developerName') return null;
  if (key === 'category') return fallbackCategory(value);
  if (parent === 'capabilities') return fallbackCapability(value);
  if (parent === 'defaultPrompt' || key === 'defaultPrompt') return fallbackPrompt(value, context.displayName || '该插件');
  if (key === 'description' || key === 'shortDescription' || key === 'short_description' || key === 'short-description') {
    return context.description || `使用 ${context.displayName || '该插件'} 在 Codex 中完成相关工作。`;
  }
  if (key === 'longDescription') {
    return context.description || `使用 ${context.displayName || '该插件'} 在 Codex 中完成相关工作，查看相关信息并整理下一步。`;
  }
  return null;
}

function fallbackYamlDisplayString(value, key, strings) {
  if (!isEnglishOnly(value)) return value;
  if (key.includes('display_name')) return localizeTitleFallback(value, strings);
  return '提供相关工作流与操作指导。';
}

function fallbackPrompt(value, displayName) {
  const lower = value.toLowerCase();
  if (/^(find|search|pull|get|look up|retrieve)\b/.test(lower)) {
    return `在 ${displayName} 中查找相关信息并总结要点`;
  }
  if (/^(create|build|set up|add|generate|draft|write)\b/.test(lower)) {
    return `用 ${displayName} 创建或配置相关内容`;
  }
  if (/^(show|summarize|analyze|review|check|compare|inspect)\b/.test(lower)) {
    return `用 ${displayName} 查看并总结相关信息`;
  }
  if (/^(debug|troubleshoot|diagnose|fix)\b/.test(lower)) {
    return `用 ${displayName} 排查相关问题`;
  }
  if (/^(why|what|how|when|which|can you)\b/.test(lower)) {
    return `用 ${displayName} 回答这个问题并给出依据`;
  }
  return `使用 ${displayName} 帮我完成这个任务`;
}

function fallbackCategory(value) {
  const categories = {
    Coding: '开发编程',
    Engineering: '工程开发',
    Productivity: '效率',
    Research: '研究',
    Design: '设计',
    Lifestyle: '生活方式',
    Security: '安全',
  };
  return categories[value] || '其他';
}

function fallbackCapability(value) {
  const capabilities = {
    Interactive: '交互',
    Read: '读取',
    Write: '写入',
  };
  return capabilities[value] || localizeTitleFallback(value, {});
}

function localizeTitleFallback(value, strings) {
  const known = localizeKnown(value, strings);
  if (known !== value) return known;
  const phrases = [
    ['Search Company Knowledge', '搜索公司知识'],
    ['Capture Tasks From Meeting Notes', '从会议纪要捕获任务'],
    ['Generate Status Report', '生成状态报告'],
    ['Spec to Backlog', '规格转待办列表'],
    ['Triage Issue', '问题分诊'],
    ['Build / Run / Debug', '构建 / 运行 / 调试'],
    ['Backend setup', '后端设置'],
    ['Database schema', '数据库结构'],
    ['Reactive queries', '响应式查询'],
    ['Server functions', '服务端函数'],
    ['Auth-aware data access', '认证感知的数据访问'],
    ['Realtime apps', '实时应用'],
    ['Scheduled jobs', '定时任务'],
    ['File storage', '文件存储'],
    ['Mobile backends', '移动端后端'],
    ['Scaling guidance', '扩展指导'],
    ['Analysis', '分析'],
    ['File generation', '文件生成'],
    ['Writes', '写入'],
    ['Portfolio search, filtering, aggregation, and sorting', '组合搜索、筛选、聚合和排序'],
    ['Company search by name or D-U-N-S number', '按名称或 D-U-N-S 编号搜索公司'],
    ['Detailed company credit-risk reports', '详细公司信用风险报告'],
    ['Company ownership and linkage trees', '公司所有权和关联树'],
    ['Credit application decisioning', '授信申请决策'],
    ['Portfolio folder creation, movement, and organization', '组合文件夹创建、移动和整理'],
    ['Server-provided Finance Analytics skill discovery', '服务端提供的金融分析技能发现'],
    ['Entity resolution and firmographics', '实体解析和企业画像'],
    ['Credit ratings and rating history', '信用评级和评级历史'],
    ['Credit opinions, outlooks, and rating drivers', '信用观点、展望和评级驱动因素'],
    ['Upgrade and downgrade trigger analysis', '评级上调和下调触发因素分析'],
    ['Rating methodology and scorecard factors', '评级方法论和记分卡因素'],
    ['ESG credit considerations', 'ESG 信用考量'],
    ['Ownership, beneficial owners, ultimate owners, and subsidiaries', '所有权、受益所有者、最终所有者和子公司'],
    ['Financial statements, key indicators, and ratios', '财务报表、关键指标和比率'],
    ['Company filings search and summarization', '公司申报文件搜索和总结'],
    ['Research document search', '研究文档搜索'],
    ['Earnings-call transcript search', '财报电话会文字稿搜索'],
    ['News monitoring', '新闻监控'],
    ['Peer identification', '同行识别'],
    ['Sector outlook and country-risk context', '行业展望和国家风险上下文'],
    ['Managers, directors, and key officers', '经理、董事和关键高管'],
  ];
  let next = value;
  for (const [from, to] of phrases) {
    if (next === from) return to;
  }
  const words = {
    Search: '搜索',
    Company: '公司',
    Knowledge: '知识',
    Capture: '捕获',
    Tasks: '任务',
    From: '从',
    Meeting: '会议',
    Notes: '纪要',
    Generate: '生成',
    Status: '状态',
    Report: '报告',
    Spec: '规格',
    to: '转',
    Backlog: '待办列表',
    Triage: '分诊',
    Issue: '问题',
    Filters: '筛选器',
    Overview: '概览',
    Troubleshooter: '故障排查',
    Content: '内容',
    Debugger: '调试器',
    Agent: '代理',
    Performance: '性能',
    Audit: '审计',
    Refactor: '重构',
    View: '视图',
    Simulator: '模拟器',
    Browser: '浏览器',
    Build: '构建',
    Run: '运行',
    Debug: '调试',
  };
  next = next.split(/\b/).map((part) => words[part] || part).join('');
  return next !== value && hasCjk(next) ? next : `${value}（工具）`;
}

function localizeKnown(value, strings) {
  if (typeof value !== 'string') return '';
  return Object.prototype.hasOwnProperty.call(strings, value) ? strings[value] : value;
}

function pickChinese(...values) {
  return values.find((value) => typeof value === 'string' && hasCjk(value)) || '';
}

function isEnglishOnly(value) {
  return typeof value === 'string' && hasAsciiLetter(value) && !hasCjk(value);
}

function hasAsciiLetter(value) {
  return /[A-Za-z]/.test(value);
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function replaceKnownStrings(value, strings, replacements) {
  let next = value;
  const entries = Object.entries(strings)
    .filter(([from, to]) => from && to && from !== to)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    if (next.includes(from)) {
      next = next.split(from).join(to);
      replacements.push({ from, to });
    }
  }
  return next;
}

function createBackupBatch(projectRoot, reports) {
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(projectRoot, 'backups', id);
  fs.mkdirSync(backupDir, { recursive: true });
  const manifest = {
    id,
    createdAt: new Date().toISOString(),
    files: reports.map((report) => ({
      path: report.filePath,
      before: report.binary ? undefined : report.before,
      beforeBase64: report.binary ? report.before.toString('base64') : undefined,
      existed: report.existed !== false,
      replacements: report.replacements,
    })),
  };
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return {
    id,
    createdAt: manifest.createdAt,
    files: manifest.files.length,
    path: backupDir,
  };
}

function summarizeReports(reports) {
  const matchedReports = reports.filter((report) => report.matches > 0);
  return {
    files: reports.map((report) => ({
      path: report.filePath,
      matches: report.matches,
      willChange: report.changed,
    })),
    matchedFiles: matchedReports.length,
    matches: reports.reduce((sum, report) => sum + report.matches, 0),
    changedFiles: reports.filter((report) => report.changed).map(toPublicChange),
    notes: buildNotes(matchedReports.length),
  };
}

function toPublicChange(report) {
  return {
    path: report.filePath,
    replacements: report.replacements.length,
  };
}

function buildNotes(changedCount) {
  const notes = [];
  if (changedCount > 0) {
    notes.push('如果 Codex 界面仍显示旧英文，请完全退出并重新打开 Codex。');
    notes.push('Codex 更新后可再次点击扫描和应用汉化，工具会重新定位版本化缓存目录。');
  }
  notes.push('默认不会删除整块缓存目录，避免影响插件安装状态。');
  return notes;
}

function assertInsideAny(targetPath, rootPaths) {
  if (rootPaths.some((rootPath) => isInside(targetPath, rootPath))) return;
  throw new Error(`Refusing to restore outside allowed roots: ${targetPath}`);
}

function isInside(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  return !(relative.startsWith('..') || path.isAbsolute(relative));
}

function assertInside(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to restore outside Codex home: ${targetPath}`);
  }
}

module.exports = {
  createPatcher,
  loadTranslations,
  loadSidecars,
  patchJson,
  patchText,
};
