# Rule Files

Rule files live in `.open-rules/` and are plain Markdown (`.md`), plain text (`.txt`), or MDC (`.mdc`) files. They are the single source of truth for all AI-agent instructions.

## Naming Convention

Files are sorted **lexicographically** by relative path. Use a numeric prefix to control ordering:

```
.open-rules/
  00-core.md            # loaded first — foundational rules
  10-security.md        # general security guidelines
  20-testing.md         # testing conventions
  80-technical.md       # project-specific technical context
  90-import-claude.md   # imported content (last)
```

The prefix is purely a convention — any valid filename works.

## Creating Rule Files

### By hand

Create any `.md` file in `.open-rules/`:

```markdown
# Security Guidelines

- Never log secrets or credentials.
- Validate all user input at system boundaries.
- Use parameterized queries for database access.
```

### With the CLI

```bash
open-rules add security-guidelines
# Creates .open-rules/security-guidelines.md
```

## Frontmatter

Rule files support optional YAML frontmatter for controlling scope and targeting.

### `applyTo` — Scope a rule to specific files

Add `applyTo` to make a rule apply only to certain file patterns. This generates **separate scoped output files** for Copilot and Cursor. Claude receives all rules regardless of `applyTo`.

**Single glob:**

```markdown
---
applyTo: 'src/**/*.ts'
---
# TypeScript Rules

- Use strict mode.
- Prefer interfaces over type aliases for object shapes.
```

**Multiple globs:**

```markdown
---
applyTo:
  - 'src/**/*.test.ts'
  - 'test/**/*.ts'
---
# Testing Rules

- Use `describe`/`it` blocks.
- One assertion per test.
```

**Inline array syntax:**

```markdown
---
applyTo: ['src/**/*.ts', 'lib/**/*.ts']
---
```

When syncing, a rule with `applyTo` produces:
- **Copilot:** `.github/instructions/open-rules-<slug>.instructions.md` with `applyTo` in its frontmatter.
- **Cursor:** `.cursor/rules/open-rules-<slug>.mdc` with `applyTo` in its frontmatter.
- **Claude:** Included in the global `CLAUDE.md` (Claude does not support scoped rules).

Rules **without** `applyTo` go into the main global output file for each target.

### `targets` — Limit a rule to specific targets

By default, every rule is included in every enabled target. Use `targets` to restrict a rule to specific outputs:

```markdown
---
targets: [copilot, cursor]
---
# IDE-Specific Rules

- Use inline completions for simple patterns.
```

```markdown
---
targets:
  - claude
---
# Claude-Only Rules

- Use extended thinking for complex refactors.
```

### Combining `applyTo` and `targets`

```markdown
---
applyTo: 'test/**/*.test.js'
targets: [copilot]
---
# Copilot Test Rules

- Suggest `node:test` and `node:assert/strict` imports.
```

This rule only appears in Copilot output and only applies to test files.

## Subdirectories

Rule files can be organized into subdirectories. They are discovered recursively:

```
.open-rules/
  00-core.md
  security/
    10-auth.md
    20-input-validation.md
  testing/
    10-unit-tests.md
```

All files are sorted by their full relative path, so `security/10-auth.md` sorts after `00-core.md`.

## Fetched Rules

Rules fetched from GitHub with `open-rules fetch` are placed in a subdirectory named after the repo:

```
.open-rules/
  00-core.md
  myorg-shared-rules/
    00-core.md
    10-security.md
```

These are regular rule files and participate in sync like any other.

## Imported Rules

Rules imported with `open-rules import` are prefixed with `90-import-`:

```
.open-rules/
  90-import-copilot.md         # from local Copilot file
  90-import-cursor.md          # from local Cursor file
  90-import-myorg-repo-claude.md  # from GitHub repo
```

The `90-` prefix ensures imported content is loaded last.
