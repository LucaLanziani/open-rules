# Configuration

Configuration dictates exactly how files are ingested and where data is propagated. It defaults entirely within `.open-rules/config.json`.

## Schema

```json
{
  "rulesDir": ".open-rules",
  "includeExtensions": [".md", ".txt", ".mdc"],
  "excludeFiles": ["README.md", "config.json"],
  "targets": {
    "copilot": {
      "enabled": true,
      "path": ".github/copilot-instructions.md",
      "applyTo": "**/*",
      "sourceMode": "reference"
    },
    "cursor": {
      "enabled": true,
      "path": ".cursor/rules/open-rules.mdc",
      "applyTo": "**/*",
      "sourceMode": "reference"
    },
    ...
  }
}
```

### Core Settings
- `rulesDir` (string): Relative destination of the single-source folders containing rules and config. Default is `.open-rules`.
- `includeExtensions` (string[]): Limits filesystem traversal to matching file-endings.
- `excludeFiles` (string[]): Prevents internal setup files (`config.json`, internal `README.md`) from accidentally becoming prompts.

### Targets Settings
Inside the `targets` block, every key maps to a target adapter implemented in `src/targets/`.

- `enabled` (boolean): Flag toggling whether this file is created during a `sync`. 
- `path` (string): Context-relative path for file creation. Example: `.github/copilot-instructions.md`.
- `applyTo` (string | string[]): Output-aware flag. Modifies destination formatting. For example Copilot will format it into the output YAML Frontmatter as `applyTo: "**/*"`.
- `sourceMode` (enum `reference` | `embed`): 
  - **`reference`**: Prevents rule content explosion. Drops pointers back to `.open-rules` directory relying directly on the Agent's file-system comprehension skills.
  - **`embed`**: Inlines all discovered and concatenated texts directly into the artifact output file.
