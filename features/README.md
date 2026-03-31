# Feature Proposals

Planned features for `open-rules`. Each document contains a user story describing the motivation and concrete usage scenarios, followed by an implementation plan.

| # | Feature | Description |
|---|---|---|
| 01 | [`validate`](./01-validate-command.md) | Validate rule files and config for errors before syncing |
| 02 | [`list`](./02-list-command.md) | List all rule files with metadata, scope, and target info |
| 03 | [`diff`](./03-diff-command.md) | Show a unified diff of what `sync` would change |
| 04 | [Rule templates](./04-rule-templates.md) | Scaffold rules from predefined templates (security, testing, etc.) |
| 05 | [`watch`](./05-watch-command.md) | Auto-sync when `.open-rules/` files change |
| 06 | [`remove`](./06-remove-command.md) | Remove a rule and clean up its generated scoped outputs |
| 07 | [CI sync check](./07-ci-sync-check.md) | Enhance `--dry-run` to detect drift and fail CI when out of sync |
| 08 | [Windsurf target](./08-windsurf-target.md) | Native adapter for Windsurf (Codeium) AI IDE |
