# AI Rules Consolidator

Centralize AI-agent instructions in a single source folder (`.open-rules`) and generate compatible files for tools such as Copilot, Cursor, and Claude Code.

## Why

Instead of duplicating instructions in multiple formats, keep them in one place and sync adapters.

## Quick start

```bash
npm install
npm run init
npm run sync
```

This creates:

- `.open-rules/config.json` (source + targets config)
- `.open-rules/*.md` rule files (source of truth)
- `.github/copilot-instructions.md`
- `.cursor/rules/open-rules.mdc`
- `CLAUDE.md`

## CLI

```bash
open-rules init
open-rules add security-basics
open-rules import all --force --sync
open-rules sync
open-rules sync --dry-run
```

Import sources from existing tool files into `.open-rules`:

```bash
open-rules import
open-rules import copilot cursor
open-rules import claude --force
open-rules import all --sync
```

- default sources: `all` (`copilot`, `cursor`, `claude`)
- `--force`: overwrite existing imported files (`90-import-<source>.md`)
- `--sync`: run `sync` immediately after import

## Config

Default config in `.open-rules/config.json`:

```json
{
  "rulesDir": ".open-rules",
  "includeExtensions": [".md", ".txt", ".mdc"],
  "excludeFiles": ["README.md", "config.json"],
  "targets": {
    "copilot": {
      "enabled": true,
      "path": ".github/copilot-instructions.md",
      "applyTo": "**/*",
      "sourceMode": "reference"
    },
    "cursor": {
      "enabled": true,
      "path": ".cursor/rules/open-rules.mdc",
      "applyTo": "**/*",
      "sourceMode": "reference"
    },
    "claude": {
      "enabled": true,
      "path": "CLAUDE.md",
      "sourceMode": "reference"
    }
  }
}
```

You can add more targets by adding entries under `targets`.
For Copilot, set `targets.copilot.applyTo` to include frontmatter in generated output.
For Cursor, set `targets.cursor.applyTo` to a glob (or array of globs) to control where the rule applies.
Set `sourceMode` to `embed` (default) or `reference` per target:

- `embed`: copy merged `.open-rules` content into generated file
- `reference`: generated file only points to `.open-rules` files as source of truth

## Scoped rules per file/folder

You can scope individual rule files using frontmatter in the rule itself.

Example `.open-rules/20-backend.md`:

```md
---
applyTo:
  - "src/api/**"
  - "src/services/**"
targets: [copilot, cursor]
---

# Backend rules

- Prefer pure domain services.
- Keep HTTP handlers thin.
```

- `applyTo`: optional string or list of globs for that specific rule file
- `targets`: optional target filter (`copilot`, `cursor`, `claude`, etc.)

Behavior:

- Global rules (no `applyTo`) stay in main generated target files.
- Scoped Copilot rules generate per-rule files under `.github/instructions/`.
- Scoped Cursor rules generate per-rule files under `.cursor/rules/`.
- Scoped files are generated with the `open-rules-` prefix and cleaned up on sync.

## Typical workflow

1. Add/edit files in `.open-rules/`
2. Run `open-rules sync`
3. Commit both source rules and generated adapters

## Adding a new target

Target renderers are split by file under `src/targets/`:

- `src/targets/<target>.js`: render logic for one target
- `src/targets/index.js`: target registry map

To add a target, create a renderer file and register it in `src/targets/index.js`.
