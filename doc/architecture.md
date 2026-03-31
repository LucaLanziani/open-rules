# Architecture Overview

`open-rules` is a zero-dependency Node.js CLI. It follows a unidirectional data flow: rule files in `.open-rules/` are the source of truth, and target adapter files are generated outputs.

## Component Model

```
┌─────────────────────────────────────────────────────┐
│              Source: .open-rules/                    │
│                                                     │
│   config.json    00-core.md    10-security.md  ...  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                 CLI Orchestration                    │
│                                                     │
│   bin/open-rules.js  ──▶  src/cli.js                │
│   (entry point)          (all commands)              │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                 src/targets/                         │
│                                                     │
│   index.js ──routes──▶ copilot.js                   │
│                    ├──▶ cursor.js                    │
│                    ├──▶ claude.js                    │
│                    └──▶ generic.js (fallback)        │
│                                                     │
│   helpers.js (shared: resolveRulesBody,              │
│               normalizeApplyTo, toTitle)             │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Generated Files                     │
│                                                     │
│   .github/copilot-instructions.md                   │
│   .github/instructions/open-rules-*.instructions.md │
│   .cursor/rules/open-rules.mdc                      │
│   .cursor/rules/open-rules-*.mdc                    │
│   CLAUDE.md                                         │
└─────────────────────────────────────────────────────┘
```

## Sync Data Flow

The `sync` command is the primary operation:

1. **Config loading** — `loadConfig()` reads `.open-rules/config.json` and merges it over `DEFAULT_CONFIG`.
2. **File discovery** — `listRuleFiles()` recursively walks `.open-rules/`, filtering by `includeExtensions` and `excludeFiles`.
3. **Parsing** — Each file is parsed with `parseRuleFile()`:
   - `splitFrontmatter()` separates YAML frontmatter from body content.
   - `parseFrontmatterMetadata()` extracts `applyTo` and `targets` fields.
4. **Sorting** — Rules are sorted lexicographically by relative path (`00-core.md` before `90-import-claude.md`).
5. **Target filtering** — `normalizeTargets()` keeps only enabled targets with a valid `path`.
6. **Rule routing** — For each target:
   - `isRuleEnabledForTarget()` checks if the rule's `targets` frontmatter includes this target (all rules match if `targets` is unset).
   - Rules with `applyTo` are separated as "scoped rules" (Copilot and Cursor only).
   - Rules without `applyTo` are "global rules" and go into the main output file.
7. **Content generation** — Two representations are built:
   - `buildMergedRules()` — full concatenated content (for `embed` mode).
   - `buildReferencedRules()` — pointer list (for `reference` mode).
8. **Rendering** — `renderTargetContent()` dispatches to the target-specific renderer.
9. **Output** — Files are written. Stale scoped output files are cleaned up.

## Import Data Flow

The `import` command reverses the flow — it reads from target files and creates `.open-rules/` source files:

```
  existing target file          src/cli.js               .open-rules/
  (e.g. CLAUDE.md)          (importRules)            90-import-claude.md
        │                        │                          │
        │  read raw content      │                          │
        │───────────────────────▶│                          │
        │                        │                          │
        │                        │  splitFrontmatter()      │
        │                        │  strip title headers     │
        │                        │  looksLikeGenerated?     │
        │                        │  (skip if yes)           │
        │                        │                          │
        │                        │  write cleaned content   │
        │                        │─────────────────────────▶│
```

## Fetch Data Flow

The `fetch` command downloads files via the GitHub Contents API:

1. Parse `owner/repo[/folder]` from the argument.
2. Call `fetchGitHubDirectory()` to list files at that path.
3. Filter by `includeExtensions`.
4. Download each file with `downloadFile()` (follows up to 5 redirects).
5. Write to `.open-rules/<owner-repo>/[<folder>/]`.

## Key Design Decisions

- **Zero dependencies** — Only Node.js built-ins (`fs`, `path`, `https`). No YAML parser; frontmatter is parsed with a minimal hand-written parser.
- **Lexicographic ordering** — File naming convention (`00-`, `10-`, `90-`) controls rule priority.
- **Scoped rules** — Rules with `applyTo` frontmatter produce per-file outputs for Copilot (`.instructions.md`) and Cursor (`.mdc`), while remaining global for Claude.
- **Generated-content detection** — `looksLikeGeneratedOpenRules()` prevents circular imports by checking for sentinel text in generated output.