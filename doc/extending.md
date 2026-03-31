# Extending Targets

Adding new target formats requires two steps: create a renderer module and register it.

## 1. Create `src/targets/<target-name>.js`

Renderers are pure functions that take a `target` config object and a `content` bundle, and return a formatted string.

Example for a hypothetical "windsurf" target:

```javascript
// src/targets/windsurf.js
const { resolveRulesBody, normalizeApplyTo } = require('./helpers');

function renderWindsurfTarget(target, content) {
    const rulesBody = resolveRulesBody(target, content);

    return [
        '# Windsurf Instructions',
        '',
        rulesBody,
        ''
    ].join('\n');
}

module.exports = {
    renderWindsurfTarget
};
```

### Available Helpers (`src/targets/helpers.js`)

| Function | Description |
|---|---|
| `resolveRulesBody(target, content)` | Returns the correct string based on `sourceMode` (`reference` → pointer list, `embed` → full content). |
| `normalizeApplyTo(input)` | Converts a string or array of globs to a YAML-safe quoted string. Returns `''` if empty. |
| `toTitle(input)` | Converts a slug like `my-rule` to `My Rule`. |

### The `target` object

The renderer receives:

```javascript
{
  name: 'windsurf',          // key from config.targets
  enabled: true,
  path: '.windsurf/rules.md',
  sourceMode: 'reference',
  applyTo: ['src/**/*.ts']   // only present for scoped rule renders
}
```

### The `content` object

```javascript
{
  mergedRules: '...',       // full concatenated Markdown (for embed mode)
  referencedRules: '...'    // pointer list Markdown (for reference mode)
}
```

## 2. Register in `src/targets/index.js`

```javascript
const { renderWindsurfTarget } = require('./windsurf');

const targetRenderers = {
    copilot: renderCopilotTarget,
    cursor: renderCursorTarget,
    claude: renderClaudeTarget,
    windsurf: renderWindsurfTarget  // add your renderer
};
```

The key must match the target name in `config.json`. Unrecognized target names fall back to `renderGenericTarget`.

## 3. Add to config

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

Run `open-rules sync` and the new target file is generated.

## Scoped Rule Support

Currently, only `copilot` and `cursor` support scoped rules (per-file outputs from `applyTo` frontmatter). The scoped output directory and file extension are defined in `resolveScopedOutputMeta()` in `src/cli.js`. To add scoped rule support for a new target, add a case there and include the target name in the `supportsScopedRules` check in `syncRules()`.
