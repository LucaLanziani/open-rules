# Commands

The CLI tool executes actions via positional arguments parsed natively within `src/cli.js`.

### `open-rules init`
**Description**: Initializes the current directory as an Open Rules source.
**Operation**:
1. Creates the `.open-rules` directory.
2. Bootstraps `.open-rules/config.json` with the `DEFAULT_CONFIG`.
3. Populates basic placeholder files (`README.md`, `00-core.md`).

### `open-rules add <rule-name>`
**Description**: Scaffolds a new rule markdown file.
**Arguments**:
- `<rule-name>`: A human-readable title (e.g., `security basics`). Quotes aren't required, but the string will be slugified.
**Operation**:
- Filters output via `toSlug()` generating e.g. `.open-rules/security-basics.md`.
- File content gets scaffolded with an auto-generated title.

### `open-rules fetch <owner>/<repo>[/<folder>] [--ref <ref>] [--force] [--sync]`
**Description**: Downloads rule files directly from a GitHub repository into `.open-rules/`.
**Arguments**:
- `<owner>/<repo>`: GitHub repository in `owner/repo` format.
- `[/<folder>]`: Optional subfolder path within the repository (e.g., `owner/repo/rules/backend`).
- `--ref <branch|tag>`: Git ref to fetch from. Defaults to the repository's default branch.
- `--force`: Overwrite files that already exist locally.
- `--sync`: Run `sync` immediately after fetching.
**Operation**:
- Calls the GitHub Contents API to list files in the target path.
- Filters files by `config.includeExtensions` (`.md`, `.txt`, `.mdc` by default).
- Downloads each file and writes it to `.open-rules/<owner-repo>/<folder>/`.
- Skips already-existing files unless `--force` is given.
- The GitHub API base URL can be overridden with the `OPEN_RULES_GITHUB_API_BASE` environment variable.

### `open-rules sync [--dry-run]`
**Description**: Triggers the generation process that outputs target artifacts.
**Arguments**:
- `--dry-run`: (Optional) Read the rules, generate the artifact strings entirely in memory, but dump the expected file outputs and sizes to standard output without touching the filesystem.
**Operation**:
- Reads configuration and validates directory presence.
- Sorts rules array, combines them via referenced rules or embed strategy.
- Uses `renderTargetContent()` to convert intermediate representations to tool-specific adapters.

### `open-rules import [sources...] [--force] [--sync]`
**Description**: Pulls extant AI rules built manually down into the `.open-rules` format.
**Arguments**:
- `[sources...]`: Select target sources to query (`copilot`, `cursor`, `claude`, or `all`). Default connects to `all`.
- `--force`: Ignore preexisting `90-import-<source>.md` files and actively overwrite them. 
- `--sync`: Automatically trigger a `sync` pass directly after retrieving the new files.
**Operation**:
- Resolves where e.g. Cursor expects files based on the `config.json`.
- Extracts information, intentionally stripping generated markdown labels (`# Copilot Instructions`), standard comments, and formatting YAML front matters.
- Checks `looksLikeGeneratedOpenRules()` ensuring it won't mistakenly consume previously generated output.
- Outputs into e.g. `.open-rules/90-import-cursor.md`.
