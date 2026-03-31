# Feature: `open-rules diff` Command

## User Story

As a developer who wants to review changes before syncing, I want to see a clear diff of what `open-rules sync` would change in my generated files, so that I can review the impact of rule edits before committing — especially useful in code review workflows.

### Scenario: Reviewing a rule change before sync

I edited `.open-rules/10-security.md` and want to see what will change in the generated files:

```bash
$ open-rules diff
.github/copilot-instructions.md
  - `.open-rules/10-security.md`    (reference list unchanged, but content diff in reference mode won't show)

--- .cursor/rules/open-rules.mdc
+++ .cursor/rules/open-rules.mdc (generated)
@@ -5,6 +5,7 @@
 - `.open-rules/00-core.md`
 - `.open-rules/10-security.md`
+- `.open-rules/15-input-validation.md`
 - `.open-rules/80-technical-context.md`

1 file would change, 2 files up to date
```

### Scenario: Seeing full embed diff

When using `embed` mode, the diff shows the full content changes:

```bash
$ open-rules diff
--- CLAUDE.md
+++ CLAUDE.md (generated)
@@ -12,3 +12,7 @@
 - Never log secrets or credentials.
+- Sanitize all user input at API boundaries.
+- Use parameterized queries for all database access.
```

---

## Implementation

### CLI entry point

Add a `diff` branch in `main()` inside `src/cli.js`:

```javascript
if (command === 'diff') {
    diffRules(process.cwd());
    return;
}
```

### `diffRules(rootDir)` function

1. **Generate expected output** — Run the same logic as `syncRules()` but instead of writing files, collect the `{ path, content }` pairs. Refactor `syncRules` to accept an optional callback or return the generated content instead of writing directly.
2. **Read current files** — For each target output path, read the existing file (or treat as empty if missing).
3. **Compare** — For each target:
   - If the file doesn't exist: mark as `new`.
   - If the file exists and content matches: mark as `up to date`.
   - If the file exists and content differs: mark as `changed` and compute a unified diff.
4. **Output**: Print a unified diff (similar to `git diff`) for each changed file. Print a summary at the end: `N files would change, M files up to date`.

> **Note**: For CI pass/fail checks (exit code 1 when files are out of sync), use `open-rules sync --dry-run` instead. See feature [07-ci-sync-check](./07-ci-sync-check.md).

### Refactoring `syncRules`

Extract the content-generation loop into a pure function `generateSyncOutputs(rootDir, config)` that returns an array of `{ targetPath, content }` objects. Both `syncRules` and `diffRules` call this function:

```javascript
function generateSyncOutputs(rootDir) {
    const config = loadConfig(rootDir);
    const rulesDir = path.join(rootDir, config.rulesDir);
    // ... same file discovery, parsing, sorting ...
    const outputs = [];
    for (const target of targets) {
        // ... same content generation ...
        outputs.push({ targetPath: target.path, content: output });
        // ... scoped rules too ...
    }
    return outputs;
}
```

### Diff algorithm

Implement a minimal line-based unified diff. For each pair of (existing, generated):

1. Split both into lines.
2. Find common prefix/suffix lines.
3. Output context lines (3 lines around changes) with `-`/`+` markers.

Since the project is zero-dependency, implement a simple longest-common-subsequence (LCS) diff or a simpler greedy approach that handles the typical case (lines added/removed/changed in blocks). The files are small (typically < 100 lines), so performance is not a concern.

### Help text

Add to `printHelp()`:

```
  open-rules diff                 Show what sync would change (unified diff)
```

### Tests

- Rule files unchanged → `0 files would change`, exit 0.
- Rule file added → diff shows new content.
- Rule file edited → unified diff output.
- Scoped file changes → diff includes scoped output files.
