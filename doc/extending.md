# Extending Targets

The generic rendering architecture makes adding new formats highly accessible. Implementing AI plugins for VSCode, new LLMs, or generic project configurations only require two steps:

## 1. Create a `src/targets/<target-name>.js` Render Module

Render modules are simple pure functions. They ingest the finalized `target` configuration properties, alongside the fully traversed `content` bundle. Output expects a single formatted string.

*Example scenario: A theoretical platform called `windsurf`.*
Create `src/targets/windsurf.js`:

```javascript
// src/targets/windsurf.js
const { resolveRulesBody, normalizeApplyTo } = require('./helpers');

function renderWindsurfTarget(target, content) {
    // Determine whether to use "reference" or "embed" text based on config
    const rulesBody = resolveRulesBody(target, content);
    
    // Process optional glob structures.
    const applyTo = normalizeApplyTo(target.applyTo);
    
    const formattedHeader = [
        '<windsurf-config>',
        `  apply: ${applyTo.length > 0 ? applyTo : '*'}`,
        '</windsurf-config>',
        ''
    ];

    // Combine and emit.
    return [
        ...formattedHeader,
        '# Windsurf Auto-Generated Instructions\n',
        rulesBody,
        ''
    ].join('\n');
}

module.exports = {
    renderWindsurfTarget
};
```

**Common Helper Functions via `src/targets/helpers.js`:**
- `resolveRulesBody(target, content)`: Automatically processes `sourceMode` (`reference` vs `embed`) returning the correct string chunk.
- `normalizeApplyTo(input)`: Transforms string-driven rules to Yaml-Quoted strings or Array formats conditionally.
- `toTitle(input)`: Capitalizes properties.

## 2. Register via `src/targets/index.js`

To hook the new module into the main sync loop, update `index.js`. 

```javascript
// src/targets/index.js
const { renderCopilotTarget } = require('./copilot');
const { renderCursorTarget } = require('./cursor');
const { renderClaudeTarget } = require('./claude');
// 1. Import your target module
const { renderWindsurfTarget } = require('./windsurf'); 
const { renderGenericTarget } = require('./generic');

const targetRenderers = {
    copilot: renderCopilotTarget,
    cursor: renderCursorTarget,
    claude: renderClaudeTarget,
    // 2. Link your renderer to the config target key
    windsurf: renderWindsurfTarget 
};

function renderTargetContent(target, content) {
    const renderer = targetRenderers[target.name] || renderGenericTarget;
    return renderer(target, content);
}

module.exports = {
    renderTargetContent,
    targetRenderers
};
```

Your system is now completely hooked into configuration files. Define `windsurf` in your `config.json` targets, run `open-rules sync`, and the resulting `path` destination will automatically map against `renderWindsurfTarget`.
