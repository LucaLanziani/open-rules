---
applyTo: test/**/*.test.js
---
## Testing
Tests live in `test/` and use Node.js built-in `node:test` + `node:assert/strict`. No external test dependencies.
Each test suite creates an isolated temp directory via `fs.mkdtempSync`, runs `open-rules init` inside it, and cleans up with `fs.rmSync` in `afterEach`. This means tests never touch the project's own `.open-rules`.
Run with: `npm test`