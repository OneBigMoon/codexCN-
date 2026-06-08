# Codex CN++ Design

## Goal

Codex CN++ is a local click-to-use app for applying and restoring Chinese display text patches for Codex plugin and skill catalog metadata. It is built for repeated use after Codex updates, where plugin metadata and cache directories may be regenerated.

## Scope

The first version targets visible plugin and skill catalog copy, including plugin display names, plugin descriptions, prompt suggestions, categories, skill titles, and skill descriptions. It scans known Codex metadata families under the user's Codex home:

- `/Users/x/.codex/.tmp/plugins`
- `/Users/x/.codex/.tmp/bundled-marketplaces`
- `/Users/x/.codex/plugins/cache`
- `/Users/x/.codex/vendor_imports`
- `/Users/x/.codex/skills`
- `/Users/x/.codex/superpowers`

It avoids changing operational identifiers such as plugin package `name`, skill frontmatter `name`, repository URLs, homepage URLs, and executable code.

## Architecture

The app has a small Node.js backend and a static browser UI. The backend exposes JSON endpoints for scan, apply, restore, and status. The patch engine is separate from the server so it can be tested and reused from the command line.

Backups are batch-based. Every apply operation writes original file contents into `backups/<batch-id>/manifest.json` before changing files. Restore reads a backup manifest and writes each file back to its original content.

## Data Flow

1. Scan walks configured Codex path families and finds supported metadata files.
2. The patch engine parses JSON and Markdown frontmatter where possible.
3. It matches exact English strings against `data/translations.json`.
4. Apply writes only files whose content changed and stores a backup batch first.
5. Restore rewrites files from a chosen or latest backup batch.
6. The UI displays counts, changed paths, backup batch IDs, and restart/cache notes.

## Cache Handling

Codex can read metadata from multiple mirrored locations. The app therefore scans all visible path families on every apply instead of relying on hard-coded version directories. The app does not delete broad cache folders by default. It reports which paths changed and reminds the user to restart Codex when UI text remains stale.

## Safety

The app is local-only and binds to `127.0.0.1`. It does not need network access. It refuses to restore from a backup manifest that points outside the configured Codex home. It uses exact string replacements to avoid corrupting unrelated metadata.

## Testing

Tests cover scanning, JSON patching, Markdown frontmatter patching, backup creation, restore, dry runs, and protection against changing skill identifiers.
