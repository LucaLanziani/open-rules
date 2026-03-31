# Configuration

All configuration lives in `.open-rules/config.json`. It is created by `open-rules init` and can be edited manually.

## Default Config

```json
{
  "rulesDir": ".open-rules",
  "includeExtensions": [".md", ".txt", ".mdc"],
  "excludeFiles": ["README.md", "config.json"],
  "targets": {
    "copilot": {
      "enabled": true,
      "path": ".github/copilot-instructions.md",
      "sourceMode": "reference"
    },
    "cursor": {
      "enabled": true,
      "path": ".cursor/rules/open-rules.mdc",
      "sourceMode": "reference"
    },
    "claude": {
      "enabled": true,
      "path": "CLAUDE.md",
      "sourceMode": "reference"
    }
  }
}
```

## Core Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `rulesDir` | `string` | `".open-rules"` | Relative path to the directory containing rule files and config. |
| `includeExtensions` | `string[]` | `[".md", ".txt", ".mdc"]` | Only files with these extensions are processed during sync and fetch. |
| `excludeFiles` | `string[]` | `["README.md", "config.json"]` | Filenames to skip (matched against basename only). |

## Target Settings

Each key under `targets` defines an output adapter. The key name (e.g., `copilot`) maps to a renderer in `src/targets/`.

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Whether this target is generated during `sync`. Set to `false` to skip. |
| `path` | `string` | *(per target)* | Relative path where the output file is written. |
| `sourceMode` | `"reference"` \| `"embed"` | `"reference"` | How rule content is included in the output. |

### `sourceMode` Explained

- **`reference`** — The generated file contains only a list of pointers back to the `.open-rules/` files. The AI agent reads the source files directly. Keeps generated files small and avoids content duplication.

  ```markdown
  ## Open Rules Source

  Rules are stored in `.open-rules`. Read those files directly and treat them as the source of truth.
  Do not rely on copied content in this file.

  ### Rule files

  - `.open-rules/00-core.md`
  - `.open-rules/10-security.md`
  ```

- **`embed`** — The generated file contains the full concatenated content of all rule files. Useful when the AI tool cannot read arbitrary workspace files.

  ```markdown
  ## Open Rules Source

  Generated from `.open-rules` files. Do not edit this section manually.

  ### 00-core.md

  # Core behavior
  - Be precise and concise.
  ...
  ```

## Adding Custom Targets

Add a new entry under `targets` to generate output for additional tools:

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

Targets without a dedicated renderer in `src/targets/` fall back to the generic renderer, which produces a simple Markdown file with a `# <Name> Instructions` heading.

## Disabling a Target

```json
{
  "targets": {
    "cursor": {
      "enabled": false,
      "path": ".cursor/rules/open-rules.mdc",
      "sourceMode": "reference"
    }
  }
}
```

When `enabled` is `false`, `sync` skips this target entirely. Existing output files are **not** deleted — remove them manually if needed.
