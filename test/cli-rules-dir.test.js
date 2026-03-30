'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.resolve(__dirname, '../bin/open-rules.js');
const DEFAULTS_DIR = path.resolve(__dirname, '../defaults');

/**
 * Run the CLI inside an isolated temp directory.
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

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'open-rules-test-'));
}

function rimraf(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe('init', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = makeTempDir(); });
    afterEach(() => rimraf(tmpDir));

    test('creates .open-rules with config.json', () => {
        const { status } = runCLI(['init'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, '.open-rules', 'config.json')));
    });

    test('copies all files from defaults/ into .open-rules', () => {
        runCLI(['init'], tmpDir);
        for (const file of fs.readdirSync(DEFAULTS_DIR)) {
            assert.ok(
                fs.existsSync(path.join(tmpDir, '.open-rules', file)),
                `Expected ${file} to exist in .open-rules`
            );
        }
    });

    test('default file content matches the defaults/ source', () => {
        runCLI(['init'], tmpDir);
        for (const file of fs.readdirSync(DEFAULTS_DIR)) {
            const expected = fs.readFileSync(path.join(DEFAULTS_DIR, file), 'utf8');
            const actual = fs.readFileSync(path.join(tmpDir, '.open-rules', file), 'utf8');
            assert.equal(actual, expected, `Content mismatch for ${file}`);
        }
    });

    test('config.json records the default rulesDir (.open-rules)', () => {
        runCLI(['init'], tmpDir);
        const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.open-rules', 'config.json'), 'utf8'));
        assert.equal(config.rulesDir, '.open-rules');
    });

    test('is idempotent — existing files are not overwritten on re-init', () => {
        runCLI(['init'], tmpDir);
        fs.writeFileSync(path.join(tmpDir, '.open-rules', '00-core.md'), '# Modified\n', 'utf8');
        runCLI(['init'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.open-rules', '00-core.md'), 'utf8');
        assert.equal(content, '# Modified\n', 'Existing files must not be overwritten on re-init');
    });
});

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------
describe('add', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = makeTempDir();
        runCLI(['init'], tmpDir);
    });
    afterEach(() => rimraf(tmpDir));

    test('creates a new rule file in .open-rules', () => {
        const { status } = runCLI(['add', 'my-rule'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, '.open-rules', 'my-rule.md')));
    });

    test('errors when the rule already exists', () => {
        runCLI(['add', 'my-rule'], tmpDir);
        const { status, stderr } = runCLI(['add', 'my-rule'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /already exists/);
    });

    test('slugifies the rule name correctly', () => {
        runCLI(['add', 'My Cool Rule'], tmpDir);
        assert.ok(fs.existsSync(path.join(tmpDir, '.open-rules', 'my-cool-rule.md')));
    });
});

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------
describe('sync', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = makeTempDir();
        runCLI(['init'], tmpDir);
    });
    afterEach(() => rimraf(tmpDir));

    test('generates all enabled target files', () => {
        const { status } = runCLI(['sync'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')));
        assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'open-rules.mdc')));
    });

    test('--dry-run prints output without writing files', () => {
        const { status, stdout } = runCLI(['sync', '--dry-run'], tmpDir);
        assert.equal(status, 0);
        assert.match(stdout, /\[dry-run\] Would write/);
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')));
    });

    test('generated copilot file references the .open-rules rule files', () => {
        runCLI(['sync'], tmpDir);
        const copilot = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
        assert.match(copilot, /\.open-rules\//);
    });

    test('newly added rule appears in target output after sync', () => {
        runCLI(['add', 'extra-context'], tmpDir);
        runCLI(['sync'], tmpDir);
        const copilot = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
        assert.match(copilot, /extra-context\.md/);
    });

    test('errors with a clear message when .open-rules is missing', () => {
        rimraf(path.join(tmpDir, '.open-rules'));
        const { status, stderr } = runCLI(['sync'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /Config not found|Rules folder not found/);
    });
});

// ---------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------
describe('import', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = makeTempDir();
        runCLI(['init'], tmpDir);
    });
    afterEach(() => rimraf(tmpDir));

    test('skips sources whose files do not exist — exits 0 with skip messages', () => {
        const { status, stdout } = runCLI(['import', 'all'], tmpDir);
        assert.equal(status, 0);
        assert.match(stdout, /Skipped/);
    });

    test('imports an existing plain copilot file into .open-rules', () => {
        const githubDir = path.join(tmpDir, '.github');
        fs.mkdirSync(githubDir, { recursive: true });
        fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# My Rule\n\n- Always be precise.\n', 'utf8');

        const { status } = runCLI(['import', 'copilot'], tmpDir);
        assert.equal(status, 0);
        assert.ok(fs.existsSync(path.join(tmpDir, '.open-rules', '90-import-copilot.md')));
        const content = fs.readFileSync(path.join(tmpDir, '.open-rules', '90-import-copilot.md'), 'utf8');
        assert.match(content, /Always be precise/);
    });

    test('skips a copilot file that was generated by open-rules', () => {
        runCLI(['sync'], tmpDir);
        const { stdout } = runCLI(['import', 'copilot'], tmpDir);
        assert.match(stdout, /appears to be generated by open-rules/);
        assert.ok(!fs.existsSync(path.join(tmpDir, '.open-rules', '90-import-copilot.md')));
    });

    test('--force overwrites an existing import file', () => {
        const githubDir = path.join(tmpDir, '.github');
        fs.mkdirSync(githubDir, { recursive: true });
        fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# V1\n\n- Rule one.\n', 'utf8');
        runCLI(['import', 'copilot'], tmpDir);

        fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# V2\n\n- Rule two.\n', 'utf8');
        runCLI(['import', 'copilot', '--force'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.open-rules', '90-import-copilot.md'), 'utf8');
        assert.match(content, /Rule two/);
    });

    test('--sync triggers a sync pass after import', () => {
        const githubDir = path.join(tmpDir, '.github');
        fs.mkdirSync(githubDir, { recursive: true });
        fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# My Rule\n\n- Always be precise.\n', 'utf8');

        runCLI(['import', 'copilot', '--sync'], tmpDir);
        assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')));
    });
});
