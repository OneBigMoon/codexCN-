const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createPatcher,
  loadTranslations,
} = require('../src/patcher');
const { buildMacosApp } = require('../src/macosApp');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const pluginDir = path.join(codexHome, '.tmp/plugins/plugins/browser/.codex-plugin');
  const skillDir = path.join(codexHome, 'skills/example');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    name: 'browser',
    description: 'Browser / browser-use plugin',
    interface: {
      displayName: 'Browser',
      shortDescription: 'Control the in-app browser with Codex',
      longDescription: 'Browser lets Codex open and control the in-app browser, mainly for local development pages and files.',
      category: 'Engineering',
      defaultPrompt: ['Test my checkout flow on localhost'],
    },
  }, null, 2));
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: brainstorming',
    'description: Explore intent, requirements, and design before implementation',
    '---',
    '',
    '# Brainstorming',
  ].join('\n'));
  return { root, codexHome };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('scan finds supported Codex metadata files', async () => {
  const { codexHome } = makeFixture();
  const patcher = createPatcher({ codexHome, projectRoot: path.dirname(codexHome), extraRoots: [] });
  const result = await patcher.scan();
  assert.equal(result.files.length, 2);
  assert.equal(result.matches >= 4, true);
});

test('dry run reports changes without writing files or backups', async () => {
  const { root, codexHome } = makeFixture();
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  const pluginPath = path.join(codexHome, '.tmp/plugins/plugins/browser/.codex-plugin/plugin.json');
  const before = fs.readFileSync(pluginPath, 'utf8');
  const result = await patcher.apply({ dryRun: true });
  const after = fs.readFileSync(pluginPath, 'utf8');
  assert.equal(result.changedFiles.length > 0, true);
  assert.equal(after, before);
  assert.equal(fs.existsSync(path.join(root, 'backups')), false);
});

test('apply translates display copy and preserves identifiers', async () => {
  const { root, codexHome } = makeFixture();
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  const result = await patcher.apply();
  const pluginPath = path.join(codexHome, '.tmp/plugins/plugins/browser/.codex-plugin/plugin.json');
  const skillPath = path.join(codexHome, 'skills/example/SKILL.md');
  const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert.equal(result.changedFiles.length, 2);
  assert.equal(plugin.name, 'browser');
  assert.equal(plugin.interface.displayName, '浏览器');
  assert.equal(plugin.interface.category, '工程开发');
  assert.match(skill, /name: brainstorming/);
  assert.match(skill, /description: 探索意图、需求和设计，再进入实现/);
});

test('restore returns files to the latest backup content', async () => {
  const { root, codexHome } = makeFixture();
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  const pluginPath = path.join(codexHome, '.tmp/plugins/plugins/browser/.codex-plugin/plugin.json');
  const before = fs.readFileSync(pluginPath, 'utf8');
  const applyResult = await patcher.apply();
  assert.notEqual(fs.readFileSync(pluginPath, 'utf8'), before);
  const restoreResult = await patcher.restore({ batchId: applyResult.backupBatch.id });
  assert.equal(restoreResult.restoredFiles.length, 2);
  assert.equal(fs.readFileSync(pluginPath, 'utf8'), before);
});

test('translation data contains the requested Codex catalog labels', () => {
  const translations = loadTranslations();
  assert.equal(translations.strings.Featured, '推荐');
  assert.equal(translations.strings['OpenAI Developers'], 'OpenAI 开发者');
  assert.equal(translations.strings['Verification Before Completion'], '完成前验证');
});

test('json files without replacements keep their original formatting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const pluginDir = path.join(codexHome, '.tmp/plugins/plugins/unknown/.codex-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  const original = '{"name":"unknown","interface":{"displayName":"Already Localized"}}';
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), original);
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  const result = await patcher.apply({ dryRun: true });
  assert.equal(result.changedFiles.length, 0);
  assert.equal(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'), original);
});

test('skill markdown patching leaves body text untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const skillDir = path.join(codexHome, 'skills/body-safe');
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, [
    '---',
    'name: body-safe',
    'description: Explore intent, requirements, and design before implementation',
    '---',
    '',
    '# Body',
    'Write and Read should remain English in the body.',
  ].join('\n'));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const text = fs.readFileSync(skillPath, 'utf8');
  assert.match(text, /description: 探索意图、需求和设计，再进入实现/);
  assert.match(text, /Write and Read should remain English in the body\./);
});

test('patching avoids partial replacements inside longer display strings', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const pluginDir = path.join(codexHome, '.tmp/plugins/plugins/build-web-apps/.codex-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  const pluginPath = path.join(pluginDir, 'plugin.json');
  fs.writeFileSync(pluginPath, JSON.stringify({
    name: 'build-web-apps',
    interface: {
      displayName: 'Build Web Apps',
      shortDescription: 'Build frontend-focused web apps with generated assets, browser testing, payments, and databases',
      longDescription: 'Use Build Web Apps to create frontend application surfaces.',
      defaultPrompt: ['Design a new landing page for my new SaaS product.'],
      category: 'Developer Tools',
    },
  }, null, 2));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
  assert.equal(plugin.interface.displayName, '构建 Web 应用');
  assert.equal(plugin.interface.shortDescription, '构建以前端为主的 Web 应用，包含生成素材、浏览器测试、支付和数据库');
  assert.match(plugin.interface.longDescription, /[\u3400-\u9fff]/);
  assert.doesNotMatch(plugin.interface.longDescription, /使用 Build Web 应用/);
  assert.equal(plugin.interface.defaultPrompt[0], '使用 构建 Web 应用 帮我完成这个任务');
});

test('plugin display fields get Chinese fallback when no exact translation exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const pluginDir = path.join(codexHome, '.tmp/plugins/plugins/example/.codex-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  const pluginPath = path.join(pluginDir, 'plugin.json');
  fs.writeFileSync(pluginPath, JSON.stringify({
    name: 'example',
    description: 'A brand new integration that has not been translated yet.',
    interface: {
      displayName: 'Example',
      shortDescription: 'Do useful work with Example',
      longDescription: 'Example lets Codex inspect records, summarize findings, and prepare next steps.',
      category: 'Coding',
      capabilities: ['Backend setup'],
      defaultPrompt: [
        'Find the latest records and summarize next steps.',
        'Create a report from this project.',
        'Why are users dropping off?',
      ],
    },
  }, null, 2));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
  assert.match(plugin.description, /[\u3400-\u9fff]/);
  assert.match(plugin.interface.shortDescription, /[\u3400-\u9fff]/);
  assert.match(plugin.interface.longDescription, /[\u3400-\u9fff]/);
  assert.equal(plugin.interface.category, '开发编程');
  assert.match(plugin.interface.capabilities[0], /[\u3400-\u9fff]/);
  assert.deepEqual(plugin.interface.defaultPrompt, [
    '在 Example 中查找相关信息并总结要点',
    '用 Example 创建或配置相关内容',
    '用 Example 回答这个问题并给出依据',
  ]);
});

test('string defaultPrompt gets Chinese fallback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const pluginDir = path.join(codexHome, '.tmp/plugins/plugins/example/.codex-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  const pluginPath = path.join(pluginDir, 'plugin.json');
  fs.writeFileSync(pluginPath, JSON.stringify({
    name: 'example',
    interface: {
      displayName: 'Example',
      defaultPrompt: 'Search workspace content and summarize the right update',
    },
  }, null, 2));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
  assert.equal(plugin.interface.defaultPrompt, '在 Example 中查找相关信息并总结要点');
});

test('skill markdown block descriptions get Chinese fallback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const skillDir = path.join(codexHome, 'skills/block-description');
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, [
    '---',
    'name: block-description',
    'description: >-',
    '    Lists records and searches data with a CLI.',
    '    Use when the user asks about records.',
    '---',
    '',
    '# Body',
    'The body remains untouched.',
  ].join('\n'));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const text = fs.readFileSync(skillPath, 'utf8');
  assert.match(text, /description: 该技能提供相关工作流与操作指导。/);
  assert.doesNotMatch(text.split('---')[1], /Lists records/);
  assert.match(text, /The body remains untouched\./);
});

test('openai yaml display metadata gets Chinese fallback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const skillDir = path.join(codexHome, 'skills/example/agents');
  fs.mkdirSync(skillDir, { recursive: true });
  const yamlPath = path.join(skillDir, 'openai.yaml');
  fs.writeFileSync(yamlPath, [
    'interface:',
    '  display_name: "Search Company Knowledge"',
    '  short_description: "Search Confluence and Jira context"',
    '',
  ].join('\n'));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const text = fs.readFileSync(yamlPath, 'utf8');
  assert.match(text, /display_name: "搜索公司知识"/);
  assert.match(text, /short_description: "提供相关工作流与操作指导。"/);
});

test('skill markdown description uses exact value replacement', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const skillDir = path.join(codexHome, 'skills/exact-description');
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, [
    '---',
    'name: exact-description',
    'description: Write custom tools after reading the spec',
    '---',
  ].join('\n'));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const text = fs.readFileSync(skillPath, 'utf8');
  assert.match(text, /description: 提供相关工作流与操作指导。/);
  assert.doesNotMatch(text, /写入 custom tools/);
});

test('skill markdown patches metadata short descriptions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const skillDir = path.join(codexHome, 'skills/short-description');
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, [
    '---',
    'name: short-description',
    "description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations.",
    'metadata:',
    '  short-description: Create or update a skill',
    '---',
  ].join('\n'));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  await patcher.apply();
  const text = fs.readFileSync(skillPath, 'utf8');
  assert.match(text, /description: 编写有效技能的指南/);
  assert.match(text, /short-description: 创建或更新技能/);
});

test('translation data covers requested system and personal skill copy', () => {
  const translations = loadTranslations().strings;
  const required = [
    'Chrome: Control Chrome',
    'Computer Use: Computer Use',
    'OpenAI Developers: Chatgpt App Submission',
    'Inspect a ChatGPT Apps MCP server codebase and generate chatgpt-app-submission.json with app info suggestions, tool hint justifications, test cases, and negative test cases, then report review-check findings and outputSchema warnings for submission review.',
    'Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always',
    'Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions',
    'Create polished PowerPoint and Google Slides decks',
    'Create and edit spreadsheet or Google Sheets-ready files',
  ];
  for (const text of required) {
    assert.equal(typeof translations[text], 'string', `missing translation for ${text}`);
    assert.notEqual(translations[text], text, `translation should change ${text}`);
  }
});

test('apply creates missing agent display sidecars and restore removes them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const skillDir = path.join(codexHome, 'plugins/cache/openai-curated/openai-developers/test/skills/chatgpt-app-submission');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: chatgpt-app-submission',
    'description: 检查 ChatGPT Apps MCP 服务器代码库，生成 chatgpt-app-submission.json，其中包含应用信息建议、工具提示理由、测试用例和反向测试用例，并报告提交审核检查结果与 outputSchema 警告。',
    '---',
  ].join('\n'));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  const applyResult = await patcher.apply();
  const sidecarPath = path.join(skillDir, 'agents/openai.yaml');
  assert.equal(fs.existsSync(sidecarPath), true);
  assert.match(fs.readFileSync(sidecarPath, 'utf8'), /display_name: "ChatGPT App 提交"/);
  const restoreResult = await patcher.restore({ batchId: applyResult.backupBatch.id });
  assert.equal(restoreResult.restoredFiles.includes(sidecarPath), true);
  assert.equal(fs.existsSync(sidecarPath), false);
});

test('apply can create sidecars in configured extra skill roots', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const extraRoot = path.join(root, '.cc-switch/skills');
  const skillDir = path.join(extraRoot, 'dogfood');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: dogfood',
    'description: "对 Web 应用做探索式 QA：发现问题、证据和报告。"',
    '---',
  ].join('\n'));
  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [extraRoot] });
  const applyResult = await patcher.apply();
  const sidecarPath = path.join(skillDir, 'agents/openai.yaml');
  assert.equal(fs.existsSync(sidecarPath), true);
  assert.match(fs.readFileSync(sidecarPath, 'utf8'), /display_name: "探索测试"/);
  await patcher.restore({ batchId: applyResult.backupBatch.id });
  assert.equal(fs.existsSync(sidecarPath), false);
});

test('apply patches Codex app directory cache with exact translations only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const directoryDir = path.join(codexHome, 'cache/codex_app_directory');
  fs.mkdirSync(directoryDir, { recursive: true });
  const directoryPath = path.join(directoryDir, 'catalog.json');
  fs.writeFileSync(directoryPath, JSON.stringify({
    schema_version: 1,
    connectors: [
      {
        id: 'known',
        name: 'Sales',
        description: 'Prepare sales work faster',
        labels: {
          category: 'Business & Operations',
        },
        appMetadata: {
          tagline: 'Create marketing visuals from a brief or product image.',
        },
      },
      {
        id: 'unknown',
        name: 'Coffee App',
        description: 'Order coffee from a local cafe',
      },
    ],
  }, null, 2));

  const patcher = createPatcher({ codexHome, projectRoot: root, extraRoots: [] });
  const scanResult = await patcher.scan();
  assert.equal(scanResult.files.some((file) => file.path === directoryPath), true);

  await patcher.apply();
  const patched = JSON.parse(fs.readFileSync(directoryPath, 'utf8'));
  assert.equal(patched.connectors[0].name, 'Sales');
  assert.equal(patched.connectors[0].description, '更快准备销售工作');
  assert.equal(patched.connectors[0].labels.category, '业务与运营');
  assert.equal(patched.connectors[0].appMetadata.tagline, '根据简报或产品图片创建营销视觉素材。');
  assert.equal(patched.connectors[1].description, 'Order coffee from a local cafe');
});

test('apply patches Codex frontend app archive with byte-safe replacements and restore works', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const codexHome = path.join(root, '.codex');
  const appRoot = path.join(root, 'Applications/Codex.app/Contents/Resources');
  const appArchivePath = path.join(appRoot, 'app.asar');
  fs.mkdirSync(appRoot, { recursive: true });
  const before = [
    'return n.length>0?[{section:{id:`plugins-featured`,title:`Featured`},plugins:n},...a]:a}',
    'description:`Short Product Design plugin description shown in the work plugins announcement modal`',
    'description:`Short Public Equity Investing plugin description shown in the work plugins announcement modal`',
    'description:`Prepare sales work faster`',
    'category:`Communication`',
    'category:`Developer Tools`',
  ].join('\n');
  fs.writeFileSync(appArchivePath, before);

  const patcher = createPatcher({
    codexHome,
    projectRoot: root,
    extraRoots: [],
    appArchivePaths: [appArchivePath],
    allowedAppArchiveRoots: [appRoot],
  });
  const applyResult = await patcher.apply();
  const after = fs.readFileSync(appArchivePath, 'utf8');

  assert.equal(applyResult.changedFiles.some((file) => file.path === appArchivePath), true);
  assert.equal(Buffer.byteLength(after), Buffer.byteLength(before));
  assert.doesNotMatch(after, /title:`Featured`/);
  assert.match(after, /title:`推荐  `/);
  assert.doesNotMatch(after, /Product Design/);
  assert.match(after, /产品设计  /);
  assert.doesNotMatch(after, /Public Equity Investing/);
  assert.match(after, /公开股票投资     /);
  assert.doesNotMatch(after, /Prepare sales work faster/);
  assert.match(after, /更快准备销售工作 /);
  assert.doesNotMatch(after, /Communication/);
  assert.match(after, /沟通协作 /);
  assert.doesNotMatch(after, /Developer Tools/);
  assert.match(after, /开发工具   /);

  const restoreResult = await patcher.restore({ batchId: applyResult.backupBatch.id });
  assert.equal(restoreResult.restoredFiles.includes(appArchivePath), true);
  assert.equal(fs.readFileSync(appArchivePath, 'utf8'), before);
});

test('buildMacosApp creates a clickable macOS app bundle launcher', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cn-test-'));
  const projectRoot = path.join(root, 'project');
  const outputRoot = path.join(root, 'dist');
  fs.mkdirSync(projectRoot, { recursive: true });

  const result = buildMacosApp({ projectRoot, outputRoot });
  const appPath = path.join(outputRoot, 'Codex CN++.app');
  const executablePath = path.join(appPath, 'Contents/MacOS/CodexCNPlusPlus');
  const plistPath = path.join(appPath, 'Contents/Info.plist');
  const launcher = fs.readFileSync(executablePath, 'utf8');
  const plist = fs.readFileSync(plistPath, 'utf8');

  assert.equal(result.appPath, appPath);
  assert.equal(fs.statSync(executablePath).mode & 0o111, 0o111);
  assert.match(plist, /<key>CFBundleExecutable<\/key>\s*<string>CodexCNPlusPlus<\/string>/);
  assert.match(plist, /<string>Codex CN\+\+<\/string>/);
  assert.match(launcher, new RegExp(escapeRegExp(projectRoot)));
  assert.match(launcher, /src\/server\.js/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:\$\{PORT\}\//);
});

test('project contains Claude_CN-style macOS menubar packaging files', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const swiftPath = path.join(projectRoot, 'macos/CodexCNMenuBar/CodexCNMenuBar.swift');
  const plistPath = path.join(projectRoot, 'macos/CodexCNMenuBar/Info.plist');
  const buildScriptPath = path.join(projectRoot, 'scripts/build-menubar-app.sh');
  const logoPath = path.join(projectRoot, 'assets/CodexCNPlusPlusIcon.svg');
  const iconGeneratorPath = path.join(projectRoot, 'scripts/generate-macos-icon.swift');

  const swift = fs.readFileSync(swiftPath, 'utf8');
  const buildScript = fs.readFileSync(buildScriptPath, 'utf8');
  const plist = fs.readFileSync(plistPath, 'utf8');
  const logo = fs.readFileSync(logoPath, 'utf8');
  const iconGenerator = fs.readFileSync(iconGeneratorPath, 'utf8');

  assert.match(swift, /NSStatusBar\.system\.statusItem/);
  assert.match(swift, /NSImage\(named: "CodexCNPlusPlus"\)/);
  assert.match(swift, /应用汉化/);
  assert.match(swift, /恢复最近备份/);
  assert.match(swift, /CodexCNPlusPlus\/scripts\/run-codex-cn\.js/);
  assert.match(swift, /nodeCandidates\(\)/);
  assert.match(swift, /\/opt\/homebrew\/bin\/node/);
  assert.match(swift, /\["node", toolPath\(\), command\]/);
  assert.match(swift, /processEnvironment\(\)/);
  assert.match(buildScript, /generate-macos-icon\.swift/);
  assert.match(buildScript, /CodexCNPlusPlus\.icns/);
  assert.match(buildScript, /TOOL_DIR="\$RESOURCES_DIR\/CodexCNPlusPlus"/);
  assert.match(buildScript, /rsync -a --delete "\$ROOT_DIR\/src\/" "\$TOOL_DIR\/src\/"/);
  assert.match(buildScript, /cp "\$NODE_BIN" "\$RESOURCES_DIR\/node\/bin\/node"/);
  assert.match(plist, /CFBundleIconFile/);
  assert.match(plist, /LSUIElement/);
  assert.match(logo, /Codex CN\+\+ logo/);
  assert.match(logo, />\+\+<\/text>/);
  assert.match(iconGenerator, /drawIcon/);
});

test('translation data covers the pasted plugin marketplace copy', () => {
  const pastedPath = '/Users/x/.codex/attachments/991013bf-8eb6-4be9-9d30-34691107f3ba/pasted-text.txt';
  if (!fs.existsSync(pastedPath)) return;
  const translations = loadTranslations().strings;
  const lines = fs.readFileSync(pastedPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const allowedBrandNames = new Set([
    'Chrome', 'GitHub', 'Slack', 'Notion', 'Linear', 'NVIDIA', 'Gmail', 'Google Drive',
    'Figma', 'Vercel', 'Canva', 'Remotion', 'BioRender', 'HeyGen', 'Shutterstock',
    'Picsart', 'Fal', 'Hugging Face', 'Netlify', 'Superpowers', 'CircleCI',
    'Cloudflare', 'Sentry', 'Expo', 'CodeRabbit', 'Neon Postgres', 'Cloudinary',
    'Hostinger', 'MarcoPolo', 'Quicknode', 'SendGrid', 'Statsig', 'Vantage',
    'YepCode', 'Render', 'Temporal', 'Supabase', 'Convex', 'Replit', 'Lovable',
    'Wix', 'Base44', 'Shopify', 'MagicPath', 'Cogedim', 'FINN', 'MyRegistry.com',
    'Setu Bharat Connect BillPay', 'WeatherPromise', 'Atlassian Rovo', 'Jam',
    'Stripe', 'Box', 'Deepnote', 'Amplitude', 'Attio', 'Brand24', 'Brex',
    'Carta CRM', 'HyperFrames by HeyGen',
    'Teams', 'SharePoint', 'Channel99', 'Circleback', 'ClickUp', 'Common Room',
    'Conductor', 'Coupler.io', 'Coveo', 'Demandbase', 'Docket', 'Domotz (Preview)',
    'Dovetail', 'Egnyte', 'Fireflies', 'Fyxer', 'Granola', 'Happenstance',
    'Help Scout', 'HighLevel', 'HubSpot', 'KeyBid Puls', 'Mem', 'Monday.com',
    'MotherDuck', 'Network Solutions', 'Omni Analytics', 'Otter.ai', 'Pipedrive',
    'Pylon', 'Ranked AI', 'Razorpay', 'Read AI', 'Responsive', 'Semrush',
    'SignNow', 'SkyWatch', 'Streak', 'Teamwork.com', 'United Rentals', 'Waldo',
    'Windsor.ai', 'Asana', 'Zoom', 'Similarweb', 'Datasite', 'ZoomInfo',
    'Docusign', 'Mixpanel', 'Mixpanel Headless', 'Close', 'Apollo', 'Meticulate',
    'ThoughtSpot', 'Clay', 'Calendly', 'Rox', 'HG Insights', 'Airtable',
    'Outreach', 'QuickBooks', 'Intercom', 'PostHog', 'Metabase', 'Actively',
    'Zoho', 'Alation', 'Superhuman Mail', 'LaTeX', 'Life Science Research',
    'Zotero', 'Alpaca', 'Binance', 'CB Insights', 'Cube', 'Daloopa',
    'D&B Finance Analytics', 'Dow Jones Factiva', 'GovTribe', "Moody's",
    'Morningstar', 'MT Newswires', 'Particl Market Research', 'PitchBook',
    'PolicyNote', 'Quartr', 'Readwise', 'Scite', 'Taxdown', 'Third Bridge',
    'Tinman AI', 'LSEG', 'S&P Global', 'FactSet', 'Aiera', 'Midpage',
    'Chronograph', 'Fiscal AI', 'Hebbia', 'Life Sciences NGS Analysis',
  ]);
  const missing = Array.from(new Set(lines))
    .filter((line) => /[A-Za-z]/.test(line))
    .filter((line) => !/[\u3400-\u9fff]/.test(line))
    .filter((line) => !allowedBrandNames.has(line))
    .filter((line) => !Object.prototype.hasOwnProperty.call(translations, line));
  assert.deepEqual(missing, []);
});

test('translation data covers the updated plugin marketplace categories', () => {
  const translations = loadTranslations().strings;
  const required = {
    'Business & Operations': '业务与运营',
    Communication: '沟通协作',
    Creativity: '创意',
    'Data & Analytics': '数据与分析',
    'Developer Tools': '开发者工具',
    'Education & Research': '教育与研究',
    Finance: '金融',
    Other: '其他',
    Productivity: '效率',
  };
  for (const [from, to] of Object.entries(required)) {
    assert.equal(translations[from], to);
  }
});

test('translation data covers visible plugin descriptions from local marketplace cache', () => {
  const roots = [
    '/Users/x/.codex/.tmp/plugins/plugins',
    '/Users/x/.codex/.tmp/bundled-marketplaces/openai-bundled/plugins',
  ];
  if (!roots.some((root) => fs.existsSync(root))) return;
  const translations = loadTranslations().strings;
  const missing = [];
  for (const root of roots) {
    for (const pluginPath of findPluginJsonFiles(root)) {
      const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
      if (
        typeof plugin.description === 'string'
        && /[A-Za-z]/.test(plugin.description)
        && !/[\u3400-\u9fff]/.test(plugin.description)
        && !Object.prototype.hasOwnProperty.call(translations, plugin.description)
      ) {
        missing.push(`${pluginPath}: ${plugin.description}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

function findPluginJsonFiles(root) {
  const results = [];
  walkFiles(root, results);
  return results;
}

function walkFiles(currentPath, results) {
  if (!fs.existsSync(currentPath)) return;
  const stat = fs.statSync(currentPath);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(currentPath)) {
      walkFiles(path.join(currentPath, name), results);
    }
    return;
  }
  if (stat.isFile() && path.basename(currentPath) === 'plugin.json') {
    results.push(currentPath);
  }
}
