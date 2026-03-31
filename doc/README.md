# Open Rules Documentation

`open-rules` consolidates AI-agent instructions into a single source directory (`.open-rules/`) and generates adapter files for GitHub Copilot, Cursor, Claude Code, and custom targets. Write your rules once, sync everywhere.

## Table of Contents

1. [Architecture Overview](./architecture.md) — System design, folder structure, and data flow.
2. [CLI Commands](./commands.md) — Complete reference for every command with examples.
3. [Configuration](./configuration.md) — Understanding `.open-rules/config.json`.
4. [Rule Files](./rule-files.md) — Writing rules, frontmatter, scoping with `applyTo`, and targeting.
5. [Examples](./examples.md) — Real-world usage patterns and recipes.
6. [Extending the System](./extending.md) — How to add new target adapters.

## Why

Different AI assistants use different file names, frontmatter formats, and conventions for ingesting instructions. Maintaining identical guidelines across multiple files leads to drift and duplication. `open-rules` gives you **one** place to write rules in plain Markdown and a single command to sync them everywhere.

## Quick Start

```bash
# Install
npm install -g open-rules

# Initialize in your project
cd my-project
open-rules init

# Edit rules
$EDITOR .open-rules/00-core.md

# Generate adapter files
open-rules sync
```

This creates:
- `.open-rules/config.json` — source and target configuration
- `.open-rules/00-core.md` — default rule file (source of truth)
- `.github/copilot-instructions.md` — Copilot adapter
- `.cursor/rules/open-rules.mdc` — Cursor adapter
- `CLAUDE.md` — Claude Code adapter
