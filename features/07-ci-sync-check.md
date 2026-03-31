# Feature: CI Sync Check (`open-rules check`)

## User Story

As a team lead, I want to enforce that generated adapter files are always in sync with `.open-rules/` source files in CI, so that developers can't forget to run `open-rules sync` before pushing — preventing stale Copilot/Cursor/Claude files from drifting from the source of truth.

### Scenario: PR with forgotten sync

A developer edits `.open-rules/10-security.md` but forgets to run `sync`. In their PR's CI pipeline:

```bash
$ open-rules check
✗ .github/copilot-instructions.md is out of date
✗ .cursor/rules/open-rules.mdc is out of date
✗ CLAUDE.md is out of date

3 files out of sync. Run `open-rules sync` to update.
```

Exit code: 1 → CI fails.

### Scenario: Everything in sync

```bash
$ open-rules check
✓ All generated files are up to date.
```

Exit code: 0 → CI passes.

### Scenario: Missing generated files

A developer initialized `.open-rules/` but never ran sync:

```bash
$ open-rules check
✗ .github/copilot-instructions.md does not exist
✗ .cursor/rules/open-rules.mdc does not exist
✗ CLAUDE.md does not exist

3 files out of sync. Run `open-rules sync` to update.
```

### Scenario: GitHub Actions integration

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  check-rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx open-rules check
```

---

## Implementation

### Current state

The project already has `npm run check` mapped to `open-rules sync --dry-run`, but the dry-run mode doesn't compare against existing files. It only shows what *would* be written and their character counts. It doesn't detect drift.

### Approach

Enhance the existing `sync --dry-run` behavior to actually compare generated content against existing files. This keeps backward compatibility while making the check meaningful.

### Changes to `syncRules()`

Currently, dry-run prints:
```
[dry-run] Would write .github/copilot-instructions.md (312 chars)
```

Change dry-run to also compare against existing files:

```javascript
if (dryRun) {
    if (!fs.existsSync(outPath)) {
        console.log(`✗ ${relativeToRoot(rootDir, outPath)} does not exist`);
        driftCount += 1;
    } else {
        const existing = fs.readFileSync(outPath, 'utf8');
        if (existing === output) {
            console.log(`✓ ${relativeToRoot(rootDir, outPath)} is up to date`);
        } else {
            console.log(`✗ ${relativeToRoot(rootDir, outPath)} is out of date`);
            driftCount += 1;
        }
    }
    continue;
}
```

Also check scoped rule files during dry-run:
- Scoped files that would be generated but don't exist → out of date.
- Scoped files that exist but shouldn't (stale) → out of date.
- Scoped files that exist with different content → out of date.

### Return value

Make `syncRules()` return a result object when in dry-run mode:

```javascript
return { driftCount };
```

Use this in `main()` to set the exit code:

```javascript
if (command === 'sync') {
    const dryRun = args.includes('--dry-run');
    const result = syncRules(process.cwd(), { dryRun });
    if (dryRun && result && result.driftCount > 0) {
        console.log(`\n${result.driftCount} files out of sync. Run \`open-rules sync\` to update.`);
        process.exitCode = 1;
    }
    return;
}
```

### Why not a separate `check` command?

The npm script `check` already maps to `sync --dry-run`. Making dry-run do the comparison keeps the existing interface working and avoids adding another command for the same purpose. Users can use either:

```bash
open-rules sync --dry-run   # same as check
npm run check               # existing alias
```

### Help text

Update the sync entry in `printHelp()`:

```
  open-rules sync [--dry-run]     Generate adapter files (--dry-run checks for drift)
```

### Tests

- Files in sync → all `✓`, exit 0.
- Source edited, files stale → `✗` for each, exit 1.
- Generated files missing → `✗`, exit 1.
- Stale scoped files (rule lost `applyTo`) → `✗`, exit 1.
- Mix of up-to-date and stale → correct counts.
