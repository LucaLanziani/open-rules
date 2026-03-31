# Feature: Rule Templates for `open-rules add`

## User Story

As a developer setting up AI rules for a new project, I want to scaffold rule files from predefined templates covering common topics (security, testing, code style, etc.), so that I don't start from a blank file and can adopt best practices immediately.

### Scenario: Adding a security rule from a template

Instead of writing security guidelines from scratch:

```bash
$ open-rules add security --template
Created .open-rules/security.md (from template: security)
```

The generated file contains a well-structured starting point:

```markdown
# Security

- Never log secrets, tokens, or credentials.
- Validate all user input at system boundaries.
- Use parameterized queries for database access.
- Avoid `eval()` and dynamic code execution.
- Sanitize output to prevent XSS.
- Follow the principle of least privilege.
```

### Scenario: Listing available templates

```bash
$ open-rules add --list-templates
Available templates:
  security          Common security guidelines (OWASP-aligned)
  testing           Testing conventions and best practices
  code-style        Code formatting and style rules
  documentation     Documentation standards
  git-workflow      Git conventions and branching rules
  api-design        REST/API design principles
  performance       Performance-oriented guidelines
  accessibility     Accessibility (a11y) best practices
```

### Scenario: Using a template with a custom name

```bash
$ open-rules add 20-backend-security --template security
Created .open-rules/20-backend-security.md (from template: security)
```

The file uses the custom name as the heading but gets its content from the `security` template.

### Scenario: Template with scoped frontmatter

Some templates include suggested frontmatter:

```bash
$ open-rules add testing --template
Created .open-rules/testing.md (from template: testing)
```

```markdown
---
applyTo: 'test/**'
---
# Testing

- Write focused tests with a single assertion per test.
- Use descriptive test names that explain the expected behavior.
- Isolate test state — no shared mutable state between tests.
- Clean up created resources (files, connections) after each test.
- Prefer real implementations over mocks when practical.
- Test edge cases: empty inputs, nulls, boundary values.
```

---

## Implementation

### Template storage

Add a `templates/` directory at the package root (alongside `defaults/`):

```
templates/
  security.md
  testing.md
  code-style.md
  documentation.md
  git-workflow.md
  api-design.md
  performance.md
  accessibility.md
```

Each template file is a complete Markdown rule file, optionally with frontmatter. The `# Title` heading will be replaced with the user's chosen name if it differs from the template name.

### CLI changes

Modify the `add` command handling in `main()`:

```javascript
if (command === 'add') {
    if (args.includes('--list-templates')) {
        listTemplates();
        return;
    }

    const name = args[1];
    const useTemplate = args.includes('--template');
    const templateName = parseOptionValue(args, '--template') || name;

    if (!name) {
        throw new Error('Please provide a rule name. Example: open-rules add security-basics');
    }

    addRule(process.cwd(), name, { template: useTemplate ? templateName : null });
    return;
}
```

### `addRule` changes

Update `addRule(rootDir, rawName, options = {})`:

1. If `options.template` is provided:
   - Look up the template file in the `templates/` directory.
   - If the template slug matches a file, read its content.
   - Replace the `# Title` heading with `# ${toTitle(rawName)}` if the name differs.
   - Write the template content to the new rule file.
2. If no template, keep current behavior (empty scaffold).

### `listTemplates()` function

1. Read filenames from the `templates/` directory.
2. For each file, read the first line (expected to be `# Title`) and a brief comment on line 3 (if present).
3. Print a formatted table.

### Template content guidelines

Each template should:
- Be opinionated but broadly applicable.
- Contain 5–10 concise bullet points.
- Include frontmatter only when the template is inherently scoped (e.g., testing).
- Use generic language that works across languages and frameworks.

### `--template` flag behavior

| Usage | Behavior |
|---|---|
| `open-rules add security --template` | Template name inferred from the rule name (`security`). |
| `open-rules add 20-sec --template security` | Template name explicitly provided. |
| `open-rules add foo --template nonexistent` | Error: `Template "nonexistent" not found. Run --list-templates to see available templates.` |

### Help text

Update `printHelp()`:

```
  open-rules add <rule-name> [--template [name]]
                                  Create a new rule file (optionally from a template)
  open-rules add --list-templates List available templates
```

### Tests

- `add security --template` → file created with template content.
- `add 20-sec --template security` → file has custom title, template body.
- `add foo --template nonexistent` → error thrown.
- `add --list-templates` → prints all template names.
- Template with frontmatter → frontmatter preserved in output.
