# Feature: `open-rules validate` Command

## User Story

As a developer maintaining AI rules across multiple targets, I want to validate my `.open-rules/` files before syncing so that I can catch frontmatter errors, broken globs, and misconfigured targets early — before they silently produce incorrect output or get committed.

### Scenario: Catching a frontmatter typo

I just edited `.open-rules/20-testing.md` and accidentally wrote `applyto:` (lowercase "t") instead of `applyTo:`. Today, `open-rules sync` silently ignores the unrecognized key and treats the rule as global. With `validate`, I would get:

```bash
$ open-rules validate
.open-rules/20-testing.md
  ⚠  Unknown frontmatter key "applyto" — did you mean "applyTo"?

1 warning, 0 errors
```

### Scenario: Referencing a disabled target

I added `targets: [windsurf]` to a rule, but `windsurf` is not defined in `config.json`. Today this rule is silently excluded from all targets. With `validate`:

```bash
$ open-rules validate
.open-rules/30-api.md
  ✗  Target "windsurf" is not configured in config.json

0 warnings, 1 error
```

### Scenario: CI gate

I add `open-rules validate` to my CI pipeline so that PRs with broken rules are blocked before merge.

```yaml
# .github/workflows/ci.yml
- run: npx open-rules validate
```

---

## Implementation

### CLI entry point

Add a `validate` branch in `main()` inside `src/cli.js`:

```javascript
if (command === 'validate') {
    const result = validateRules(process.cwd());
    process.exitCode = result.errors > 0 ? 1 : 0;
    return;
}
```

### `validateRules(rootDir)` function

1. **Load config** — call `loadConfig(rootDir)`. If the config file is missing, report an error.
2. **Discover rule files** — reuse `listRuleFiles()`.
3. **For each file**, run these checks:

#### Frontmatter checks

| Check | Severity | Message |
|---|---|---|
| Unknown keys (not `applyTo`, `targets`) | warning | `Unknown frontmatter key "<key>" — did you mean "<suggestion>"?` |
| `applyTo` value is not a string or array of strings | error | `"applyTo" must be a string or array of strings` |
| `targets` value is not a string or array of strings | error | `"targets" must be a string or array of strings` |
| `targets` references a name not in `config.targets` | error | `Target "<name>" is not configured in config.json` |
| Malformed frontmatter (opening `---` without closing `---`) | error | `Unclosed frontmatter block` |

#### Content checks

| Check | Severity | Message |
|---|---|---|
| File is empty (no body content after frontmatter) | warning | `Rule file has no content` |
| Duplicate file content (exact body match with another file) | warning | `Content is identical to <other-file>` |

#### Config checks (run once, not per-file)

| Check | Severity | Message |
|---|---|---|
| Enabled target has empty or missing `path` | error | `Target "<name>" is enabled but has no path` |
| `sourceMode` is not `reference` or `embed` | warning | `Unknown sourceMode "<value>" — expected "reference" or "embed"` |
| No enabled targets | warning | `No enabled targets in config` |

### Output format

Print results grouped by file, with `✗` for errors and `⚠` for warnings. Print a summary line at the end. Exit code 1 if any errors; 0 otherwise (warnings alone don't fail).

### Help text

Add to `printHelp()`:

```
  open-rules validate           Validate rule files and config
```

### Tests

- Valid rules → exit 0, no output.
- Unknown frontmatter key → warning printed.
- Target not in config → error, exit 1.
- Empty body → warning.
- Unclosed frontmatter → error.
- Malformed `applyTo` type → error.
