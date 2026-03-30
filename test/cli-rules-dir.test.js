'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.resolve(__dirname, '../bin/open-rules.js');
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Run the CLI in an isolated temp directory.
 * Returns { status, stdout, stderr }.
 */
function runCLI(args, cwd) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
        cwd,
        encoding: 'utf8'
    });
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    };
}

/**
 * Create a fresh temp directory for each test run.
 */
function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'open-rules-test-'));
}

function rimraf(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// init --rules-dir
// ---------------------------------------------------------------------------
describe('init --rules-dir', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = makeTempDir(); });
    afterEach(() => rimraf(tmpDir));

    test('creates the custom directory with config.json, README.md and 00-core.md', () => {
        const { status } = runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, 'custom-rules', 'config.json')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'custom-rules', 'README.md')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'custom-rules', '00-core.md')));
    });

    test('config.json records the custom rulesDir', () => {
        runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
        const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'custom-rules', 'config.json'), 'utf8'));
        assert.equal(config.rulesDir, 'custom-rules');
    });

    test('does not create default .open-rules directory', () => {
        runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
        assert.ok(!fs.existsSync(path.join(tmpDir, '.open-rules')));
    });

    test('flag can appear before the command', () => {
        const { status } = runCLI(['--rules-dir', 'custom-rules', 'init'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, 'custom-rules', 'config.json')));
    });

    test('is idempotent — running init twice does not error', () => {
        runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
        const { status } = runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
        assert.equal(status, 0);
    });
});

// ---------------------------------------------------------------------------
// add --rules-dir
// ---------------------------------------------------------------------------
describe('add --rules-dir', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = makeTempDir();
        runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
    });
    afterEach(() => rimraf(tmpDir));

    test('creates rule file inside the custom rules directory', () => {
        const { status } = runCLI(['add', 'my-rule', '--rules-dir', 'custom-rules'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, 'custom-rules', 'my-rule.md')));
    });

    test('does not create the rule file inside default .open-rules', () => {
        runCLI(['add', 'my-rule', '--rules-dir', 'custom-rules'], tmpDir);
        assert.ok(!fs.existsSync(path.join(tmpDir, '.open-rules', 'my-rule.md')));
    });

    test('errors when the rule already exists', () => {
        runCLI(['add', 'my-rule', '--rules-dir', 'custom-rules'], tmpDir);
        const { status, stderr } = runCLI(['add', 'my-rule', '--rules-dir', 'custom-rules'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /already exists/);
    });
});

// ---------------------------------------------------------------------------
// sync --rules-dir
// ---------------------------------------------------------------------------
describe('sync --rules-dir', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = makeTempDir();
        runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
    });
    afterEach(() => rimraf(tmpDir));

    test('generates target files from the custom directory', () => {
        const { status } = runCLI(['sync', '--rules-dir', 'custom-rules'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')));
    });

    test('dry-run prints output without creating files', () => {
        const { status, stdout } = runCLI(['sync', '--rules-dir', 'custom-rules', '--dry-run'], tmpDir);
        assert.equal(status, 0);
        assert.match(stdout, /\[dry-run\] Would write/);
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')));
    });

    test('generated copilot-instructions.md references files from the custom rulesDir', () => {
        runCLI(['sync', '--rules-dir', 'custom-rules'], tmpDir);
        const copilot = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
        assert.match(copilot, /custom-rules\//);
    });

    test('errors with a clear message when config.json is missing', () => {
        const { status, stderr } = runCLI(['sync', '--rules-dir', 'nonexistent-dir'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /Config not found/);
    });

    test('picks up newly added rule files', () => {
        runCLI(['add', 'extra-context', '--rules-dir', 'custom-rules'], tmpDir);
        runCLI(['sync', '--rules-dir', 'custom-rules'], tmpDir);
        const copilot = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
        assert.match(copilot, /extra-context\.md/);
    });

    test('default sync still works when no --rules-dir is given', () => {
        // The project's own .open-rules should still sync fine from PROJECT_ROOT
        const { status } = runCLI(['sync', '--dry-run'], PROJECT_ROOT);
        assert.equal(status, 0);
    });
});

// ---------------------------------------------------------------------------
// import --rules-dir
// ---------------------------------------------------------------------------
describe('import --rules-dir', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = makeTempDir();
        runCLI(['init', '--rules-dir', 'custom-rules'], tmpDir);
    });
    afterEach(() => rimraf(tmpDir));

    test('skips sources whose files do not exist — exits 0 with skip messages', () => {
        const { status, stdout } = runCLI(['import', 'all', '--rules-dir', 'custom-rules'], tmpDir);
        assert.equal(status, 0);
        assert.match(stdout, /Skipped/);
    });

    test('imports an existing plain copilot file into the custom dir', () => {
        // Create a simple (non-generated) copilot file in the temp project
        const githubDir = path.join(tmpDir, '.github');
        fs.mkdirSync(githubDir, { recursive: true });
        fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# My Custom Rule\n\n- Always be precise.\n', 'utf8');

        const { status } = runCLI(['import', 'copilot', '--rules-dir', 'custom-rules'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, 'custom-rules', '90-import-copilot.md')));
        const content = fs.readFileSync(path.join(tmpDir, 'custom-rules', '90-import-copilot.md'), 'utf8');
        assert.match(content, /Always be precise/);
    });

    test('skips source file that is already generated by open-rules', () => {
        // Run sync to generate copilot-instructions.md, then try to import it
        runCLI(['sync', '--rules-dir', 'custom-rules'], tmpDir);
        const { stdout } = runCLI(['import', 'copilot', '--rules-dir', 'custom-rules'], tmpDir);
        assert.match(stdout, /appears to be generated by open-rules/);
        assert.ok(!fs.existsSync(path.join(tmpDir, 'custom-rules', '90-import-copilot.md')));
    });

    test('--force overwrites existing import file', () => {
        const githubDir = path.join(tmpDir, '.github');
        fs.mkdirSync(githubDir, { recursive: true });
        fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# V1\n\n- Rule one.\n', 'utf8');
        runCLI(['import', 'copilot', '--rules-dir', 'custom-rules'], tmpDir);

        fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# V2\n\n- Rule two.\n', 'utf8');
        runCLI(['import', 'copilot', '--rules-dir', 'custom-rules', '--force'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, 'custom-rules', '90-import-copilot.md'), 'utf8');
        assert.match(content, /Rule two/);
    });
});
