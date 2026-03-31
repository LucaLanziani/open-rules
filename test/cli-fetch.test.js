'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.resolve(__dirname, '../bin/open-rules.js');
const MOCK_SERVER = path.resolve(__dirname, 'mock-github-server.js');

function runCLI(args, cwd, env = {}) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, ...env }
    });
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    };
}

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'open-rules-fetch-test-'));
}

function rimraf(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

/** Start the mock GitHub API server in a separate process and return its port. */
function startMockServer() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Mock server did not start within 5 seconds'));
        }, 5000);

        const proc = spawn(process.execPath, [MOCK_SERVER], { encoding: 'utf8' });
        let buf = '';
        proc.stdout.on('data', (chunk) => {
            buf += chunk;
            const match = buf.match(/PORT:(\d+)/);
            if (match) {
                clearTimeout(timeout);
                resolve({ proc, port: parseInt(match[1], 10) });
            }
        });
        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        proc.on('exit', (code) => {
            if (code !== null && code !== 0) {
                clearTimeout(timeout);
                reject(new Error(`Mock server exited with code ${code}`));
            }
        });
    });
}

// ---------------------------------------------------------------------------
// fetch — argument validation
// ---------------------------------------------------------------------------
describe('fetch — argument validation', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = makeTempDir();
        runCLI(['init'], tmpDir);
    });
    afterEach(() => rimraf(tmpDir));

    test('errors when no repository argument is given', () => {
        const { status, stderr } = runCLI(['fetch'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /Please provide a GitHub repository/);
    });

    test('errors when only a single segment (no slash) is given', () => {
        const { status, stderr } = runCLI(['fetch', 'onlyone'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /Invalid GitHub reference/);
    });

    test('errors when the owner segment is empty (leading slash)', () => {
        const { status, stderr } = runCLI(['fetch', '/repo'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /Invalid GitHub reference/);
    });

    test('errors when only flags are passed (no positional arg)', () => {
        const { status, stderr } = runCLI(['fetch', '--ref', 'main'], tmpDir);
        assert.notEqual(status, 0);
        assert.match(stderr, /Please provide a GitHub repository/);
    });
});

// ---------------------------------------------------------------------------
// fetch — against a local mock server (separate process to avoid event-loop
// blocking from spawnSync)
// ---------------------------------------------------------------------------
describe('fetch — against a local mock server', () => {
    let tmpDir;
    let mockServer;

    beforeEach(async () => {
        tmpDir = makeTempDir();
        runCLI(['init'], tmpDir);
        mockServer = await startMockServer();
    });

    afterEach(() => {
        rimraf(tmpDir);
        mockServer.proc.kill();
    });

    test('fetches rule files from the repo root into .open-rules/<owner>-<repo>/', () => {
        const { port } = mockServer;
        const { status, stdout } = runCLI(['fetch', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        assert.equal(status, 0);
        assert.match(stdout, /Fetched 01-rules\.md/);
        assert.match(stdout, /Fetch finished/);

        const destFile = path.join(tmpDir, '.open-rules', 'testowner-testrepo', '01-rules.md');
        assert.ok(fs.existsSync(destFile), 'Rule file should be saved to .open-rules/<owner>-<repo>/');
        const content = fs.readFileSync(destFile, 'utf8');
        assert.match(content, /Be precise/);
    });

    test('skips directory entries — only files are fetched', () => {
        const { port } = mockServer;
        runCLI(['fetch', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        const destDir = path.join(tmpDir, '.open-rules', 'testowner-testrepo');
        const entries = fs.readdirSync(destDir);
        assert.ok(!entries.includes('myfolder'), 'Directory entries should not be fetched as files');
    });

    test('fetches from a subfolder into .open-rules/<owner>-<repo>/<folder>/', () => {
        const { port } = mockServer;
        const { status, stdout } = runCLI(['fetch', 'testowner/testrepo/myfolder'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        assert.equal(status, 0);
        assert.match(stdout, /Fetched folder-rules\.md/);

        const destFile = path.join(tmpDir, '.open-rules', 'testowner-testrepo', 'myfolder', 'folder-rules.md');
        assert.ok(fs.existsSync(destFile), 'Subfolder file should be saved under the folder path');
        const content = fs.readFileSync(destFile, 'utf8');
        assert.match(content, /Follow folder conventions/);
    });

    test('skips already-fetched files without --force', () => {
        const { port } = mockServer;
        runCLI(['fetch', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        const destFile = path.join(tmpDir, '.open-rules', 'testowner-testrepo', '01-rules.md');
        fs.writeFileSync(destFile, '# Sentinel\n', 'utf8');

        const { stdout } = runCLI(['fetch', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        assert.match(stdout, /Skipped 01-rules\.md/);

        const content = fs.readFileSync(destFile, 'utf8');
        assert.equal(content, '# Sentinel\n', 'File should not be overwritten without --force');
    });

    test('--force overwrites already-fetched files', () => {
        const { port } = mockServer;
        runCLI(['fetch', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        const destFile = path.join(tmpDir, '.open-rules', 'testowner-testrepo', '01-rules.md');
        fs.writeFileSync(destFile, '# Sentinel\n', 'utf8');

        runCLI(['fetch', 'testowner/testrepo', '--force'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        const content = fs.readFileSync(destFile, 'utf8');
        assert.match(content, /Be precise/, 'File should be overwritten with --force');
    });

    test('--sync triggers a sync pass after fetch', () => {
        const { port } = mockServer;
        runCLI(['fetch', 'testowner/testrepo', '--sync'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')), 'CLAUDE.md should exist after --sync');
    });

    test('fetched files appear in sync output after fetch', () => {
        const { port } = mockServer;
        runCLI(['fetch', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        runCLI(['sync'], tmpDir);

        const claude = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
        assert.match(claude, /testowner-testrepo/, 'Synced output should reference fetched rules directory');
    });

    test('reports a clear error when the GitHub API returns a non-200 status', () => {
        const { port } = mockServer;
        const { status, stderr } = runCLI(['fetch', 'testowner/notfound'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        assert.notEqual(status, 0);
        assert.match(stderr, /Failed to fetch from GitHub/);
    });
});

// ---------------------------------------------------------------------------
// import — from GitHub repo
// ---------------------------------------------------------------------------
describe('import — from GitHub repo', () => {
    let tmpDir;
    let mockServer;

    beforeEach(async () => {
        tmpDir = makeTempDir();
        runCLI(['init'], tmpDir);
        mockServer = await startMockServer();
    });

    afterEach(() => {
        rimraf(tmpDir);
        mockServer.proc.kill();
    });

    test('imports copilot and claude; skips cursor (404)', async () => {
        const { port } = mockServer;
        const { status } = runCLI(['import', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        assert.equal(status, 0);

        const rulesDir = path.join(tmpDir, '.open-rules');
        assert.ok(
            fs.existsSync(path.join(rulesDir, '90-import-testowner-testrepo-copilot.md')),
            'copilot import file should exist'
        );
        assert.ok(
            fs.existsSync(path.join(rulesDir, '90-import-testowner-testrepo-claude.md')),
            'claude import file should exist'
        );
        assert.ok(
            !fs.existsSync(path.join(rulesDir, '90-import-testowner-testrepo-cursor.md')),
            'cursor import file should NOT exist (404 from mock)'
        );
    });

    test('imported content includes source attribution', () => {
        const { port } = mockServer;
        runCLI(['import', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        const outPath = path.join(tmpDir, '.open-rules', '90-import-testowner-testrepo-copilot.md');
        const content = fs.readFileSync(outPath, 'utf8');
        assert.match(content, /Source: `github:testowner\/testrepo/);
        assert.match(content, /Always add tests/);
    });

    test('skips existing output file without --force', () => {
        const { port } = mockServer;
        const outPath = path.join(tmpDir, '.open-rules', '90-import-testowner-testrepo-copilot.md');
        fs.writeFileSync(outPath, '# Sentinel\n', 'utf8');

        const { stdout } = runCLI(['import', 'testowner/testrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        assert.match(stdout, /Skipped copilot/);
        assert.equal(fs.readFileSync(outPath, 'utf8'), '# Sentinel\n', 'File should not be overwritten');
    });

    test('--force overwrites existing output file', () => {
        const { port } = mockServer;
        const outPath = path.join(tmpDir, '.open-rules', '90-import-testowner-testrepo-copilot.md');
        fs.writeFileSync(outPath, '# Sentinel\n', 'utf8');

        runCLI(['import', 'testowner/testrepo', '--force'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        const content = fs.readFileSync(outPath, 'utf8');
        assert.match(content, /Always add tests/, 'File should be overwritten with --force');
    });

    test('skips files generated by open-rules', () => {
        const { port } = mockServer;
        const { stdout } = runCLI(['import', 'testowner/generatedrepo'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });

        assert.match(stdout, /appears to be generated by open-rules/);
        const outPath = path.join(tmpDir, '.open-rules', '90-import-testowner-generatedrepo-copilot.md');
        assert.ok(!fs.existsSync(outPath), 'Generated copilot file should not be imported');
    });

    test('--sync triggers a sync pass after import', () => {
        const { port } = mockServer;
        runCLI(['import', 'testowner/testrepo', '--sync'], tmpDir, {
            OPEN_RULES_GITHUB_API_BASE: `http://127.0.0.1:${port}`
        });
        assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')), 'CLAUDE.md should exist after --sync');
    });
});
