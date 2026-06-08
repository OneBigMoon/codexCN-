# Codex CN++ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local app that scans Codex metadata, applies Chinese display-copy patches, and restores backups.

**Architecture:** A dependency-free Node.js backend serves a static UI and calls a focused patch engine. The patch engine owns scanning, translation, backup, and restore so it can be tested without the UI.

**Tech Stack:** Node.js built-in `http`, `fs`, `path`, `node:test`, static HTML/CSS/JS.

---

### Task 1: Patch Engine

**Files:**
- Create: `src/patcher.js`
- Create: `data/translations.json`
- Create: `test/patcher.test.js`

- [x] Write tests for scan, apply, restore, dry run, and skill identifier protection.
- [x] Run tests and confirm they fail before implementation.
- [x] Implement the patch engine with exact string replacements and batch backups.
- [x] Run tests and confirm they pass.

### Task 2: Local App Server

**Files:**
- Create: `src/server.js`
- Create: `src/cli.js`
- Create: `package.json`

- [x] Add HTTP endpoints for scan, apply, restore, backups, and status.
- [x] Add npm scripts for start, scan, apply, restore, and test.
- [x] Verify the server starts and returns status JSON.

### Task 3: Clickable UI

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [x] Add buttons for scan, apply, restore, and backup refresh.
- [x] Render counts, changed files, backup batches, and cache/restart notes.
- [x] Verify the UI loads through the local server.

### Task 4: Docs and Verification

**Files:**
- Create: `README.md`

- [x] Document install-free usage and restore behavior.
- [x] Run full tests.
- [x] Run a dry scan against the local Codex home.
