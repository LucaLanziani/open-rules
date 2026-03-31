# Examples

Practical recipes for common `open-rules` workflows.

---

## 1. Basic Setup

Initialize a new project and create your first rule:

```bash
cd my-project
open-rules init
open-rules add coding-standards
```

Edit `.open-rules/coding-standards.md`:

```markdown
# Coding Standards

- Use 2-space indentation.
- Prefer `const` over `let`.
- No unused imports.
```

Sync to all targets:

```bash
open-rules sync
```

Result:
```
Wrote .github/copilot-instructions.md
Wrote .cursor/rules/open-rules.mdc
Wrote CLAUDE.md
```

---

## 2. Scoped Rules for Tests

Create a rule that only applies to test files:

```bash
open-rules add testing
```

Edit `.open-rules/testing.md`:

```markdown
---
applyTo: 'test/**/*.test.js'
---
# Testing

- Use `node:test` and `node:assert/strict`.
- Each test creates an isolated temp directory.
- Clean up with `fs.rmSync` in `afterEach`.
```

After `open-rules sync`:
- `.github/copilot-instructions.md` — does NOT include this rule (it's scoped)
- `.github/instructions/open-rules-testing.instructions.md` — includes the rule with `applyTo: 'test/**/*.test.js'`
- `.cursor/rules/open-rules-testing.mdc` — includes the rule with `applyTo: 'test/**/*.test.js'`
- `CLAUDE.md` — includes the rule (Claude gets all rules regardless of scope)

---

## 3. Target-Specific Rules

Create a rule only for Claude:

```markdown
---
targets: [claude]
---
# Claude Instructions

- Use extended thinking mode for architectural decisions.
- When refactoring, explain the reasoning step by step.
```

Create a rule only for Copilot and Cursor:

```markdown
---
targets: [copilot, cursor]
---
# IDE Completion Rules

- Prefer inline suggestions over multi-line blocks.
- Match the surrounding code style.
```

---

## 4. Embed Mode vs Reference Mode

**Reference mode** (default) — generated files point to `.open-rules/`:

`.github/copilot-instructions.md`:
```markdown
# Copilot Instructions

## Open Rules Source

Rules are stored in `.open-rules`. Read those files directly.

### Rule files

- `.open-rules/00-core.md`
- `.open-rules/10-security.md`
```

**Embed mode** — generated files contain the full content:

Change in `.open-rules/config.json`:
```json
{
  "targets": {
    "copilot": {
      "enabled": true,
      "path": ".github/copilot-instructions.md",
      "sourceMode": "embed"
    }
  }
}
```

`.github/copilot-instructions.md`:
```markdown
# Copilot Instructions

## Open Rules Source

Generated from `.open-rules` files. Do not edit this section manually.

### 00-core.md

# Core behavior
- Be precise and concise.
...

### 10-security.md

# Security
- Validate all input.
...
```

---

## 5. Share Rules Across Projects (fetch)

Your team maintains rules in a shared GitHub repo `myorg/ai-rules`:

```bash
# Fetch all rules from the repo
open-rules fetch myorg/ai-rules --sync

# Fetch from a specific subfolder
open-rules fetch myorg/ai-rules/backend --sync

# Fetch a specific branch
open-rules fetch myorg/ai-rules --ref v2.0 --force --sync
```

Fetched files live under `.open-rules/myorg-ai-rules/` and are included in sync like any other rule.

---

## 6. Import Existing Rules

You already have a `CLAUDE.md` with hand-written rules and want to migrate to `open-rules`:

```bash
open-rules init
open-rules import claude --sync
```

This creates `.open-rules/90-import-claude.md` with the cleaned content from your `CLAUDE.md`, then re-generates all target files.

Import from a teammate's repo:

```bash
open-rules import myorg/their-project --ref main --force --sync
```

---

## 7. Dry Run Before Committing

Check what `sync` would produce without writing files:

```bash
open-rules sync --dry-run
# [dry-run] Would write .github/copilot-instructions.md (512 chars)
# [dry-run] Would write .github/instructions/open-rules-testing.instructions.md (287 chars)
# [dry-run] Would write .cursor/rules/open-rules.mdc (498 chars)
# [dry-run] Would write .cursor/rules/open-rules-testing.mdc (301 chars)
# [dry-run] Would write CLAUDE.md (472 chars)
```

---

## 8. Disable a Target

Stop generating Cursor files by editing `.open-rules/config.json`:

```json
{
  "targets": {
    "cursor": {
      "enabled": false,
      "path": ".cursor/rules/open-rules.mdc",
      "sourceMode": "reference"
    }
  }
}
```

```bash
open-rules sync
# Wrote .github/copilot-instructions.md
# Wrote CLAUDE.md
# (no Cursor output)
```

---

## 9. Add a Custom Target

Support a new tool (e.g., Windsurf) by adding it to config:

```json
{
  "targets": {
    "windsurf": {
      "enabled": true,
      "path": ".windsurf/rules.md",
      "sourceMode": "embed"
    }
  }
}
```

Without a custom renderer, the generic fallback produces:

```markdown
# Windsurf Instructions

## Open Rules Source

Generated from `.open-rules` files. Do not edit this section manually.
...
```

For target-specific formatting, see [Extending the System](./extending.md).

---

## 10. CI Integration

Add a check to your CI pipeline to ensure generated files are up to date:

```yaml
# .github/workflows/check-rules.yml
name: Check Rules
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx open-rules sync
      - run: git diff --exit-code
```

If someone edits a generated file directly or forgets to run `sync`, the CI job fails.

---

## 11. Multiple Scoped Rules

Organize rules by domain with different scopes:

```
.open-rules/
  00-core.md                  # global — all files
  20-frontend.md              # scoped to src/frontend/**
  30-backend.md               # scoped to src/api/**
  40-database.md              # scoped to src/db/**
```

`.open-rules/20-frontend.md`:
```markdown
---
applyTo: 'src/frontend/**'
---
# Frontend Rules

- Use React functional components.
- Prefer CSS modules over inline styles.
```

`.open-rules/30-backend.md`:
```markdown
---
applyTo: 'src/api/**'
---
# Backend Rules

- Return proper HTTP status codes.
- Log errors with structured JSON.
```

After sync, Copilot and Cursor get separate scoped files for each, while `00-core.md` goes into the main global file.
