# Feature: Windsurf Target Adapter

## User Story

As a developer using Windsurf (Codeium's AI IDE), I want `open-rules` to generate a native Windsurf rules file automatically, so that my AI rules are available in Windsurf without manual configuration — just like they are for Copilot, Cursor, and Claude.

### Scenario: Syncing rules to Windsurf

I'm using Windsurf alongside Copilot and want rules to sync to both:

```bash
$ open-rules sync
Wrote .github/copilot-instructions.md
Wrote .cursor/rules/open-rules.mdc
Wrote CLAUDE.md
Wrote .windsurf/rules/open-rules.md
```

### Scenario: Enabling Windsurf via config

After `open-rules init`, I add Windsurf to my config:

```json
{
  "targets": {
    "windsurf": {
      "enabled": true,
      "path": ".windsurf/rules/open-rules.md",
      "sourceMode": "embed"
    }
  }
}
```

Or with the updated default config, Windsurf is included but disabled by default, so I just flip the flag:

```json
"windsurf": {
    "enabled": true,
    "path": ".windsurf/rules/open-rules.md",
    "sourceMode": "embed"
}
```

### Scenario: Scoped rules for Windsurf

Windsurf supports rule files with frontmatter-based scoping (similar to Cursor's `.mdc` format). A scoped rule generates a separate file:

```
.windsurf/rules/open-rules-20-testing.md
```

With content:

```markdown
---
trigger: glob
globs: test/**/*.test.js
---
# Testing

- Use `node:test` and `node:assert/strict`.
- Each test creates an isolated temp directory.
```

---

## Implementation

### 1. Create `src/targets/windsurf.js`

```javascript
const { resolveRulesBody, normalizeWindsurfGlobs } = require('./helpers');

function renderWindsurfTarget(target, content) {
    const rulesBody = resolveRulesBody(target, content);
    const frontmatter = buildWindsurfFrontmatter(target);

    return [
        ...frontmatter,
        rulesBody,
        ''
    ].join('\n');
}

function buildWindsurfFrontmatter(target) {
    const applyTo = target.applyTo;
    if (!applyTo || (Array.isArray(applyTo) && applyTo.length === 0)) {
        return [];
    }

    const globs = Array.isArray(applyTo) ? applyTo : [applyTo];
    const globsValue = globs.length === 1
        ? globs[0]
        : globs.map(g => `  - ${g}`).join('\n');

    return [
        '---',
        'trigger: glob',
        globs.length === 1 ? `globs: ${globsValue}` : `globs:\n${globsValue}`,
        '---',
        ''
    ];
}

module.exports = {
    renderWindsurfTarget
};
```

### 2. Register in `src/targets/index.js`

```javascript
const { renderWindsurfTarget } = require('./windsurf');

const targetRenderers = {
    copilot: renderCopilotTarget,
    cursor: renderCursorTarget,
    claude: renderClaudeTarget,
    windsurf: renderWindsurfTarget
};
```

### 3. Add to `DEFAULT_CONFIG` in `src/cli.js`

Add Windsurf as a disabled-by-default target:

```javascript
const DEFAULT_CONFIG = {
    // ...
    targets: {
        // ... existing targets ...
        windsurf: {
            enabled: false,
            path: '.windsurf/rules/open-rules.md',
            sourceMode: 'embed'
        }
    }
};
```

Disabled by default because not all users have Windsurf, and adding a new output directory to existing projects could be surprising.

### 4. Add scoped rule support in `syncRules`

Update `resolveScopedOutputMeta` in `src/cli.js`:

```javascript
if (target.name === 'windsurf') {
    return {
        directory: path.dirname(target.path),
        extension: '.md'
    };
}
```

Update the `supportsScopedRules` check:

```javascript
const supportsScopedRules = target.name === 'copilot' || target.name === 'cursor' || target.name === 'windsurf';
```

### 5. Add to import source candidates

Update `importRules` to include `windsurf` as a valid local source when `all` is used:

```javascript
const ALL_LOCAL_SOURCES = ['copilot', 'cursor', 'claude', 'windsurf'];
```

And in `importRulesFromGitHub`, add a Windsurf target definition.

### 6. Windsurf rules format notes

Windsurf uses Markdown files in `.windsurf/rules/` with optional frontmatter:

```yaml
---
trigger: glob          # or "always" for global rules
globs: src/**/*.ts     # glob pattern(s) for scoped rules
---
```

The `trigger: glob` + `globs` pattern is Windsurf-specific. Rules without frontmatter or with `trigger: always` apply globally. This is similar to Cursor's `.mdc` format but with different frontmatter keys.

### Help text

No command changes needed. Windsurf is just a new target — it's configured in `config.json` and synced with the existing `open-rules sync` command.

### Documentation

Update `README.md` and `doc/configuration.md` to mention Windsurf as a supported target.

### Tests

- Windsurf enabled → `sync` generates `.windsurf/rules/open-rules.md`.
- Windsurf disabled (default) → no Windsurf file generated.
- Scoped rule → generates separate `.windsurf/rules/open-rules-20-testing.md` with `trigger: glob` frontmatter.
- Embed mode → full content included.
- Reference mode → pointer list included.
- Import from Windsurf → reads `.windsurf/rules/open-rules.md`.
