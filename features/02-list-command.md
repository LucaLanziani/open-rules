# Feature: `open-rules list` Command

## User Story

As a developer working on a project with many rule files, I want to quickly see all my rules, their metadata, and which targets they apply to, so that I can understand my rule setup at a glance without opening each file individually.

### Scenario: Auditing rules in a large project

My project has grown to 15 rule files spread across the root and fetched subdirectories. I need to understand which rules are scoped, which are global, and which targets each rule feeds into.

```bash
$ open-rules list
.open-rules/00-core.md                          global    all targets
.open-rules/10-security.md                       global    all targets
.open-rules/20-testing.md                        scoped    copilot, cursor    applyTo: test/**/*.test.js
.open-rules/30-api.md                            scoped    copilot            applyTo: src/api/**
.open-rules/80-technical-context.md              global    all targets
.open-rules/90-import-claude.md                  global    all targets
.open-rules/myorg-shared/00-standards.md         global    all targets
.open-rules/myorg-shared/10-conventions.md       global    all targets

8 rule files (6 global, 2 scoped)
Targets: copilot (enabled), cursor (enabled), claude (enabled)
```

### Scenario: Checking a specific target

I want to see only rules that will be included for the `copilot` target:

```bash
$ open-rules list --target copilot
.open-rules/00-core.md                          global
.open-rules/10-security.md                       global
.open-rules/20-testing.md                        scoped    applyTo: test/**/*.test.js
.open-rules/30-api.md                            scoped    applyTo: src/api/**
.open-rules/80-technical-context.md              global
.open-rules/90-import-claude.md                  global
.open-rules/myorg-shared/00-standards.md         global
.open-rules/myorg-shared/10-conventions.md       global

8 rule files for copilot (6 global, 2 scoped)
```

### Scenario: JSON output for scripting

I pipe the output into another tool:

```bash
$ open-rules list --json | jq '.[] | select(.scoped) | .relPath'
"20-testing.md"
"30-api.md"
```

---

## Implementation

### CLI entry point

Add a `list` branch in `main()` inside `src/cli.js`:

```javascript
if (command === 'list') {
    const targetFilter = parseOptionValue(args, '--target');
    const jsonOutput = args.includes('--json');
    listRulesCommand(process.cwd(), { target: targetFilter, json: jsonOutput });
    return;
}
```

### `listRulesCommand(rootDir, options)` function

1. **Load config** — call `loadConfig(rootDir)`.
2. **Discover and parse** — reuse `listRuleFiles()` and `parseRuleFile()` (same as sync).
3. **Filter** — if `--target` is provided, filter using `isRuleEnabledForTarget()`.
4. **Format output**:
   - **Default (table)**: Print each rule's relative path, scope status (`global` / `scoped`), targets list, and `applyTo` globs. Right-pad columns for alignment. Print a summary line.
   - **JSON (`--json`)**: Output an array of objects:
     ```json
     [
       {
         "relPath": "00-core.md",
         "scoped": false,
         "targets": [],
         "applyTo": []
       }
     ]
     ```
     An empty `targets` array means "all targets".

### Options

| Option | Description |
|---|---|
| `--target <name>` | Show only rules that apply to this target. |
| `--json` | Output machine-readable JSON instead of a formatted table. |

### Helper: `parseOptionValue(args, flag)`

Extract the value following a flag argument. Reuse for other commands that need `--flag value` parsing. This is a small utility that can live in `src/cli.js`:

```javascript
function parseOptionValue(args, flag) {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : '';
}
```

### Help text

Add to `printHelp()`:

```
  open-rules list [--target <name>] [--json]
                                  List all rule files with metadata
```

### Tests

- Project with 3 rules (1 scoped, 2 global) → correct counts in summary.
- `--target copilot` with a Claude-only rule → rule is excluded.
- `--json` → valid JSON array output.
- Empty project (no rules) → `No rule files found.` message.
