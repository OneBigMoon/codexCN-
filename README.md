# Codex CN++

Codex CN++ 是一个本地汉化补丁 App，用来增强 Codex 插件/技能列表中还没汉化的显示文案。

Logo 源文件：

```text
assets/CodexCNPlusPlusIcon.svg
```

## 启动

已生成本地 macOS 菜单栏 App：

```text
/Applications/Codex CN++.app
```

双击打开后，菜单栏会出现 `CN++`。菜单里包含：

- `应用汉化`
- `恢复最近备份`
- `刷新状态`
- `打开网页界面`
- `打开日志`
- `退出`

菜单栏 App 会内置当前 Node 运行时和 Codex CN++ 工具文件，使用方式更接近 Claude_CN。

也可以从项目内重新生成或安装：

```bash
npm run build:mac-app
npm run install:mac-app
```

命令会生成：

```text
dist/Codex CN++.app
dist/CodexCNPlusPlus-macos.zip
```

如果需要 DMG：

```bash
npm run dist:dmg
```

命令会生成：

```text
dist/CodexCNPlusPlus-macos-版本号.dmg
```

开发模式仍可直接启动：

```bash
npm start
```

打开：

```text
http://127.0.0.1:4166
```

## 使用

1. 点击 `扫描` 查看当前 Codex metadata 中可汉化的文件和文案。
2. 点击 `预演` 查看会修改哪些文件，但不写入。
3. 点击 `应用汉化` 写入中文文案，并自动创建备份批次。
4. 如果需要回退，选择备份批次后点击 `恢复最近备份`。

## Codex 更新后

Codex 更新后，缓存目录或插件版本目录可能变化。重新打开 Codex CN++，点击 `扫描`，再点击 `应用汉化` 即可重新定位并打补丁。

如果应用后 Codex 里仍然显示旧英文，请完全退出并重新打开 Codex。工具默认不会删除整块缓存目录，避免影响插件安装状态。

## 命令行

```bash
npm run scan
npm run dry-run
npm run apply
npm run restore
```

## 备份

备份保存在项目内的 `backups/` 目录。每次应用汉化前都会保存原始文件内容，恢复时只会写回允许的 Codex 缓存、技能目录和 Codex App 资源文件。
