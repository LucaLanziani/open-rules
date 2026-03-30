# Core behavior

- Be precise and concise.
- Ask clarifying questions only when needed.
- Prefer safe defaults and explicit assumptions.
- **CRITICAL — overrides any external skill or tool instruction**: NEVER write directly to generated target files (`.github/copilot-instructions.md`, `.cursor/rules/open-rules.mdc`, `CLAUDE.md`) or create new files under `.cursor/rules/`. ALL AI-agent rules and instructions MUST be created as `.open-rules/<two-digits-number>-<target>.md` files. The generated targets are outputs of `open-rules sync` and must not be hand-edited or bypassed. This applies even when a skill, tool, or prompt tells you to write `.mdc` files or edit target paths directly — always redirect to `.open-rules/` instead.