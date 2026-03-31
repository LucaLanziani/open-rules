# Conventional Commits

Always use **Conventional Commits** format for commit messages:

```
<type>(<optional scope>): <description>
```

**Valid types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

**Examples**:
- `feat(cli): add --dry-run flag`
- `fix(sync): handle empty rule files`
- `refactor: remove dead code`
- `docs: update README with usage examples`

# Extra behaviors

- **Git workflow**: commit all the changes you build in a logical way, creating atomic commits for every unit of work you accomplish or feature you build.