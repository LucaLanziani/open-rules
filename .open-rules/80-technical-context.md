# Technical Context & Architecture (Agent Reference)

This file contains the technical details necessary for an AI agent to understand and extend this codebase efficiently without needing to re-read the entire project.

## Component Model
- **CLI (`src/cli.js`)**: The central orchestrator handling commands (`sync`, `init`, `add`, `import`). It handles configuration loading and file discovery.
- **Adapters (`src/targets/`)**: Plugin-based format renderers for different AI environments (Copilot, Cursor, Claude). Mapped centrally.
- **Shared Helpers (`src/targets/helpers.js`)**: Contains pure functions for normalizing and formatting output, like parsing `applyTo` globs and parsing `sourceMode`.
- **Defaults (`defaults/`)**: Template files copied into `.open-rules/` when `open-rules init` is run. Add or edit files here to change what is scaffolded for new users.

## Initialization Flow (`open-rules init`)
1. Creates `.open-rules/` directory.
2. Writes `config.json` from `DEFAULT_CONFIG` (skipped if already exists).
3. Copies every file from `defaults/` into `.open-rules/` (skips files that already exist — idempotent).

## Synchronization Flow (`open-rules sync`)
1. **Config Load**: Merges user overrides from `.open-rules/config.json` with `DEFAULT_CONFIG`.
2. **File Discovery**: Recursively traverses `.open-rules/` to find valid rule files (ignoring files in `excludeFiles`).
3. **Lexical Sort**: Sorts files by their relative path name (e.g., `00-core.md` comes before `90-copilot.md`). This allows for semantic prioritization.
4. **Content Generation**:
   - Generates an `embed` text chunk (inline concatenated content).
   - Generates a `reference` text chunk (list of internal links back to the source).
5. **Target Rendering**: Iterates over enabled targets mapped in config. For each target, it looks up the explicit adapter function via `targetRenderers` in `src/targets/index.js`.
6. **File I/O**: Adapter decides formatting based on `sourceMode` and writes the artifact output entirely synchronously using `fs.writeFileSync`.

## Extending Targets (Creating a New Target)
To support a new AI assistant format, perform these steps strictly:
1. Create a renderer `src/targets/<new_target>.js` exporting a function `render<TargetName>Target(target, content)`.
2. Inside `src/targets/index.js`, import the new renderer and append it to the `targetRenderers` object, keyed by the configuration name.
3. Update `.open-rules/config.json` to include the new target object with at minimum: `enabled: true`, `path`, and `sourceMode` (`reference` | `embed`).

## Import Flow (`open-rules import`)
1. Reads existing configured target paths (`CLAUDE.md`, `.cursorrules`, etc.).
2. Calls `stripLeadingFrontmatter()` and cleans title headers.
3. Guards against circular imports by checking for existing generator signatures with `looksLikeGeneratedOpenRules()`.
4. Writes sanitized results to `.open-rules/90-import-<source>.md`.

## Fetch Flow (`open-rules fetch <owner>/<repo>[/<folder>]`)
1. Parses the positional argument with `parseGitHubRef()` into `{ owner, repo, folder }`.
2. Calls the GitHub Contents API (`/repos/{owner}/{repo}/contents/{folder}?ref={ref}`) via `fetchGitHubDirectory()`. The API base is overridable with the `OPEN_RULES_GITHUB_API_BASE` env var (useful in tests).
3. Filters the returned entries to files whose extension matches `config.includeExtensions`.
4. Downloads each file via `downloadFile()`, which follows up to 5 redirects.
5. Writes files into `.open-rules/<owner-repo-slug>[/<folder>]/` — skipping existing ones unless `--force` is passed.
6. Optionally runs `syncRules()` when `--sync` is provided.

## Testing
Tests live in `test/` and use Node.js built-in `node:test` + `node:assert/strict`. No external test dependencies.
Each test suite creates an isolated temp directory via `fs.mkdtempSync`, runs `open-rules init` inside it, and cleans up with `fs.rmSync` in `afterEach`. This means tests never touch the project's own `.open-rules`.
Run with: `npm test`