# Feature: `open-rules watch` Command

## User Story

As a developer actively editing AI rules, I want generated adapter files to update automatically when I save changes to `.open-rules/`, so that I don't have to remember to run `open-rules sync` manually after every edit.

### Scenario: Live editing rules during development

I'm iterating on my team's coding standards. I open `.open-rules/10-coding-style.md` in my editor and start editing:

```bash
$ open-rules watch
Watching .open-rules/ for changes...
```

Every time I save the file, the watcher detects the change and re-syncs:

```
[12:34:05] Changed: 10-coding-style.md
  Wrote .github/copilot-instructions.md
  Wrote .cursor/rules/open-rules.mdc
  Wrote CLAUDE.md
```

When I add a new rule file:

```
[12:35:12] Added: 25-error-handling.md
  Wrote .github/copilot-instructions.md
  Wrote .cursor/rules/open-rules.mdc
  Wrote CLAUDE.md
```

When I delete a rule:

```
[12:36:00] Removed: 25-error-handling.md
  Wrote .github/copilot-instructions.md
  Wrote .cursor/rules/open-rules.mdc
  Wrote CLAUDE.md
```

I stop the watcher with `Ctrl+C`:

```
Stopped watching.
```

### Scenario: Watching alongside other dev tools

I run the watcher in the background while coding:

```bash
open-rules watch &
# ... continue working ...
```

Or in a split terminal pane. The watcher stays out of the way and only prints when something changes.

---

## Implementation

### CLI entry point

Add a `watch` branch in `main()` inside `src/cli.js`:

```javascript
if (command === 'watch') {
    watchRules(process.cwd());
    return;
}
```

### `watchRules(rootDir)` function

1. **Load config** — call `loadConfig(rootDir)` to get the `rulesDir`.
2. **Initial sync** — run `syncRules(rootDir, { dryRun: false })` once to ensure a clean starting state.
3. **Watch** — use `fs.watch()` on the rules directory with `{ recursive: true }`:

```javascript
function watchRules(rootDir) {
    const config = loadConfig(rootDir);
    const rulesDir = path.join(rootDir, config.rulesDir);

    console.log(`Watching ${config.rulesDir}/ for changes...`);
    syncRules(rootDir, { dryRun: false });

    let debounceTimer = null;

    fs.watch(rulesDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Ignore config.json changes (user should re-run watch)
        if (filename === 'config.json') return;

        // Debounce rapid successive events (editors often trigger multiple)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
            console.log(`\n[${timestamp}] ${eventType}: ${filename}`);
            try {
                syncRules(rootDir, { dryRun: false });
            } catch (error) {
                console.error(`  Sync failed: ${error.message}`);
            }
        }, 200);
    });

    process.on('SIGINT', () => {
        console.log('\nStopped watching.');
        process.exit(0);
    });
}
```

### Key design decisions

| Decision | Rationale |
|---|---|
| Use `fs.watch` (not `fs.watchFile`) | `fs.watch` uses native OS events and is more efficient. It's available on all supported Node.js versions. |
| Debounce at 200ms | Editors often trigger multiple filesystem events per save. A short debounce prevents redundant syncs. |
| Ignore `config.json` | Config changes may alter target paths, which requires a restart. Print a note if `config.json` changes. |
| Full re-sync on every change | Rule files are small and few. A full sync is simpler and more reliable than incremental updates. |
| Recursive watch | Supports rule files in subdirectories (fetched rules live under `<owner-repo>/`). |

### Error handling

- If a rule file has a syntax error (bad frontmatter), `syncRules` may throw. The watcher catches the error, prints it, and continues watching — it does not crash.
- If the rules directory is deleted, the watcher exits with an error message.

### Platform note

`fs.watch` with `{ recursive: true }` works on macOS and Windows natively. On Linux, it requires Node.js 19+ (or uses polling fallback). Since the project targets modern Node.js (built-in test runner requires 18+), document that Linux users should use Node.js 19+ for the `watch` command, or that under older versions it monitors only the top-level directory.

### Help text

Add to `printHelp()`:

```
  open-rules watch                Watch .open-rules/ and auto-sync on changes
```

### Tests

Testing filesystem watchers is inherently tricky. Recommended approach:

- Unit test: ensure `syncRules` is called correctly (mock `fs.watch`).
- Integration test: create a temp directory, start the watcher, write a file, wait for sync output, then verify the generated files exist.
- Use a timeout to avoid hanging tests.
