# Feature: `open-rules remove` Command

## User Story

As a developer managing AI rules, I want to remove a rule file and have its generated scoped outputs cleaned up automatically, so that I don't leave stale adapter files in `.github/instructions/` or `.cursor/rules/` after deleting a rule.

### Scenario: Removing a scoped rule

I previously created a scoped testing rule. Now I want to remove it entirely:

```bash
$ open-rules remove 20-testing
Removed .open-rules/20-testing.md
Removed .github/instructions/open-rules-20-testing.instructions.md
Removed .cursor/rules/open-rules-20-testing.mdc
Run `open-rules sync` to update main target files.
```

The command removes the source rule file and any scoped output files that were generated from it, then reminds me to sync so that the main target files (which may reference the deleted rule) are updated.

### Scenario: Removing with auto-sync

```bash
$ open-rules remove 20-testing --sync
Removed .open-rules/20-testing.md
Removed .github/instructions/open-rules-20-testing.instructions.md
Removed .cursor/rules/open-rules-20-testing.mdc
Wrote .github/copilot-instructions.md
Wrote .cursor/rules/open-rules.mdc
Wrote CLAUDE.md
```

### Scenario: Removing a global rule

```bash
$ open-rules remove 10-security --sync
Removed .open-rules/10-security.md
Wrote .github/copilot-instructions.md
Wrote .cursor/rules/open-rules.mdc
Wrote CLAUDE.md
```

No scoped files to clean up, but the main targets are re-synced to exclude the deleted rule.

### Scenario: Trying to remove a non-existent rule

```bash
$ open-rules remove nonexistent
Error: Rule file not found: .open-rules/nonexistent.md
```

### Scenario: Dry run

```bash
$ open-rules remove 20-testing --dry-run
[dry-run] Would remove .open-rules/20-testing.md
[dry-run] Would remove .github/instructions/open-rules-20-testing.instructions.md
[dry-run] Would remove .cursor/rules/open-rules-20-testing.mdc
```

---

## Implementation

### CLI entry point

Add a `remove` branch in `main()` inside `src/cli.js`:

```javascript
if (command === 'remove') {
    const name = args[1];
    if (!name) {
        throw new Error('Please provide a rule name. Example: open-rules remove 20-testing');
    }
    const dryRun = args.includes('--dry-run');
    const shouldSync = args.includes('--sync');
    removeRule(process.cwd(), name, { dryRun, sync: shouldSync });
    return;
}
```

### `removeRule(rootDir, rawName, options)` function

1. **Resolve the rule file path**:
   - Load config.
   - Construct the expected path: `path.join(rootDir, config.rulesDir, safeName)`.
   - If `rawName` doesn't end with a known extension, try appending `.md`.
   - If the file doesn't exist, throw an error.

2. **Parse the rule file** to check for `applyTo` frontmatter (needed to know if scoped outputs exist).

3. **Find scoped output files**:
   - For each target that supports scoped rules (`copilot`, `cursor`), use `buildScopedRuleFileName()` to compute the expected scoped output filename.
   - Check if those files exist.

4. **Remove files**:
   - Delete the source rule file.
   - Delete any matching scoped output files.
   - Print what was removed (or would be removed in `--dry-run` mode).

5. **Optional sync**: if `--sync` is passed, call `syncRules()` to regenerate main target files.

6. **Hint**: if `--sync` was not passed, print a reminder to run `open-rules sync`.

### Refactoring needed

The function `buildScopedRuleFileName()` is currently only used inside `syncScopedTargetFiles`. It needs to be accessible from `removeRule` as well. No change to its logic is needed — just ensure it's callable from the new function.

### Options

| Option | Description |
|---|---|
| `--sync` | Run `sync` after removal to update main target files. |
| `--dry-run` | Show what would be removed without deleting anything. |

### Help text

Add to `printHelp()`:

```
  open-rules remove <rule-name> [--sync] [--dry-run]
                                  Remove a rule file and its scoped outputs
```

### Tests

- Remove a scoped rule → source file and scoped outputs deleted.
- Remove a global rule → only source file deleted.
- Remove with `--sync` → main targets regenerated.
- Remove non-existent rule → error thrown.
- `--dry-run` → no files deleted, output shows what would happen.
