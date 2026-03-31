const fs = require('fs');
const https = require('https');
const path = require('path');
const { renderTargetContent } = require('./targets');

const DEFAULT_CONFIG = {
    rulesDir: '.open-rules',
    includeExtensions: ['.md', '.txt', '.mdc'],
    excludeFiles: ['README.md', 'config.json'],
    targets: {
        copilot: {
            enabled: true,
            path: '.github/copilot-instructions.md',
            applyTo: '**/*',
            sourceMode: 'reference'
        },
        cursor: {
            enabled: true,
            path: '.cursor/rules/open-rules.mdc',
            applyTo: '**/*',
            sourceMode: 'reference'
        },
        claude: {
            enabled: true,
            path: 'CLAUDE.md',
            sourceMode: 'reference'
        }
    }
};

async function main(args) {
    const command = args[0] || 'sync';

    if (command === 'help' || command === '--help' || command === '-h') {
        printHelp();
        return;
    }

    if (command === 'init') {
        initProject(process.cwd());
        return;
    }

    if (command === 'sync') {
        const dryRun = args.includes('--dry-run');
        syncRules(process.cwd(), { dryRun });
        return;
    }

    if (command === 'add') {
        const name = args[1];
        if (!name) {
            throw new Error('Please provide a rule name. Example: open-rules add security-basics');
        }

        addRule(process.cwd(), name);
        return;
    }

    if (command === 'import') {
        await importRules(process.cwd(), args.slice(1));
        return;
    }

    if (command === 'fetch') {
        await fetchFromGitHub(process.cwd(), args.slice(1));
        return;
    }

    throw new Error(`Unknown command: ${command}`);
}

function printHelp() {
    console.log([
        'open-rules - consolidate AI agent rules in .open-rules and sync adapters',
        '',
        'Commands:',
        '  open-rules init                 Initialize .open-rules and config',
        '  open-rules add <rule-name>      Create a new rule file in .open-rules',
        '  open-rules import [sources]     Import existing rules from copilot/cursor/claude',
        '  open-rules import <owner>/<repo>',
        '                                  Import rules directly from a GitHub repository',
        '  open-rules fetch <owner>/<repo>[/<folder>]',
        '                                  Fetch rules from a GitHub repository (or subfolder)',
        '  open-rules sync [--dry-run]     Generate adapter files for enabled targets',
        '  open-rules help                 Show this help',
        '',
        'Import options:',
        '  sources: copilot cursor claude all (default: all)',
        '  owner/repo                      Import from a GitHub repository',
        '  --ref <branch|tag>              Git ref to import from (default: repo default branch)',
        '  --force                         Overwrite existing imported files',
        '  --sync                          Run sync after import',
        '',
        'Fetch options:',
        '  --ref <branch|tag>              Git ref to fetch from (default: repo default branch)',
        '  --force                         Overwrite already-fetched files',
        '  --sync                          Run sync after fetch',
        ''
    ].join('\n'));
}

const DEFAULTS_DIR = path.join(__dirname, '../defaults');

function initProject(rootDir) {
    const targetDir = path.join(rootDir, DEFAULT_CONFIG.rulesDir);

    ensureDir(targetDir);

    const configPath = path.join(targetDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
        console.log(`Created ${relativeToRoot(rootDir, configPath)}`);
    }

    for (const fileName of fs.readdirSync(DEFAULTS_DIR)) {
        const destPath = path.join(targetDir, fileName);
        if (!fs.existsSync(destPath)) {
            fs.copyFileSync(path.join(DEFAULTS_DIR, fileName), destPath);
            console.log(`Created ${relativeToRoot(rootDir, destPath)}`);
        }
    }

    console.log('Initialization complete.');
}

function addRule(rootDir, rawName) {
    const config = loadConfig(rootDir);
    const rulesDir = path.join(rootDir, config.rulesDir);

    ensureDir(rulesDir);

    const safeName = toSlug(rawName);
    const nextPath = path.join(rulesDir, `${safeName}.md`);

    if (fs.existsSync(nextPath)) {
        throw new Error(`Rule already exists: ${relativeToRoot(rootDir, nextPath)}`);
    }

    fs.writeFileSync(nextPath, [
        `# ${toTitle(rawName)}`,
        '',
        '- Add instructions here.',
        ''
    ].join('\n'), 'utf8');

    console.log(`Created ${relativeToRoot(rootDir, nextPath)}`);
}

async function importRules(rootDir, args = []) {
    ensureInitialized(rootDir);

    const config = loadConfig(rootDir);
    const rulesDir = path.join(rootDir, config.rulesDir);
    const force = args.includes('--force');
    const shouldSync = args.includes('--sync');

    ensureDir(rulesDir);

    // Values that follow --ref are option values, not source names
    const optionValues = new Set();
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--ref' && i + 1 < args.length) {
            optionValues.add(args[i + 1]);
        }
    }

    const requestedSources = args
        .filter((arg) => !arg.startsWith('--') && !optionValues.has(arg))
        .map((arg) => arg.toLowerCase());

    // Separate GitHub repo refs (contain '/') from local source names
    const githubRefs = requestedSources.filter((s) => s.includes('/'));
    const localRequested = requestedSources.filter((s) => !s.includes('/'));

    const localSourceCandidates = localRequested.length === 0 && githubRefs.length === 0
        ? ['copilot', 'cursor', 'claude']
        : localRequested.includes('all')
            ? ['copilot', 'cursor', 'claude']
            : localRequested;

    const validLocalSources = localSourceCandidates.filter((name) => ['copilot', 'cursor', 'claude'].includes(name));

    if (validLocalSources.length === 0 && githubRefs.length === 0) {
        throw new Error('No valid sources provided. Use: copilot, cursor, claude, all, or a GitHub repo (owner/repo).');
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const source of validLocalSources) {
        const sourcePath = resolveSourcePath(rootDir, config, source);
        if (!sourcePath) {
            console.log(`Skipped ${source}: target path is not configured.`);
            skippedCount += 1;
            continue;
        }

        if (!fs.existsSync(sourcePath)) {
            console.log(`Skipped ${source}: file not found at ${relativeToRoot(rootDir, sourcePath)}.`);
            skippedCount += 1;
            continue;
        }

        const raw = fs.readFileSync(sourcePath, 'utf8');
        const cleaned = extractImportableContent(raw);

        if (looksLikeGeneratedOpenRules(cleaned)) {
            console.log(`Skipped ${source}: appears to be generated by open-rules.`);
            skippedCount += 1;
            continue;
        }

        if (cleaned.trim().length === 0) {
            console.log(`Skipped ${source}: no importable content.`);
            skippedCount += 1;
            continue;
        }

        const outPath = path.join(rulesDir, `90-import-${source}.md`);
        if (fs.existsSync(outPath) && !force) {
            console.log(`Skipped ${source}: ${relativeToRoot(rootDir, outPath)} already exists (use --force).`);
            skippedCount += 1;
            continue;
        }

        const sourceRel = relativeToRoot(rootDir, sourcePath);
        const output = [
            `# Imported ${toTitle(source)} Instructions`,
            '',
            `Source file: \`${sourceRel}\``,
            '',
            cleaned.trim(),
            ''
        ].join('\n');

        fs.writeFileSync(outPath, output, 'utf8');
        console.log(`Imported ${source} -> ${relativeToRoot(rootDir, outPath)}`);
        importedCount += 1;
    }

    if (validLocalSources.length > 0) {
        console.log(`Import finished: ${importedCount} imported, ${skippedCount} skipped.`);
    }

    // GitHub repo sources
    if (githubRefs.length > 0) {
        const refIdx = args.indexOf('--ref');
        const ref = refIdx !== -1 && args[refIdx + 1] ? args[refIdx + 1] : '';

        for (const repoArg of githubRefs) {
            await importRulesFromGitHub(rootDir, repoArg, { force, ref, rulesDir, config });
        }
    }

    if (shouldSync) {
        syncRules(rootDir, { dryRun: false });
    }
}

async function fetchFromGitHub(rootDir, args = []) {
    // Build the set of values that are option values (not positional args)
    const optionValues = new Set();
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--ref' && i + 1 < args.length) {
            optionValues.add(args[i + 1]);
        }
    }

    const repoArg = args.find((arg) => !arg.startsWith('--') && !optionValues.has(arg));
    if (!repoArg) {
        throw new Error('Please provide a GitHub repository. Example: open-rules fetch owner/repo or open-rules fetch owner/repo/path/to/folder');
    }

    const parsed = parseGitHubRef(repoArg);
    if (!parsed) {
        throw new Error(`Invalid GitHub reference: "${repoArg}". Expected format: owner/repo or owner/repo/path/to/folder`);
    }

    const { owner, repo, folder } = parsed;

    const refIndex = args.indexOf('--ref');
    const ref = refIndex !== -1 && args[refIndex + 1] ? args[refIndex + 1] : '';
    const force = args.includes('--force');
    const shouldSync = args.includes('--sync');

    ensureInitialized(rootDir);
    const config = loadConfig(rootDir);
    const rulesDir = path.join(rootDir, config.rulesDir);
    ensureDir(rulesDir);

    const slug = [owner, repo].map(toSlug).join('-');
    const destDir = folder
        ? path.join(rulesDir, slug, folder)
        : path.join(rulesDir, slug);

    let entries;
    try {
        entries = await fetchGitHubDirectory(owner, repo, folder, ref);
    } catch (error) {
        throw new Error(`Failed to fetch from GitHub (${owner}/${repo}${folder ? '/' + folder : ''}): ${error.message}`);
    }

    const fileEntries = entries.filter((entry) => {
        if (entry.type !== 'file') {
            return false;
        }
        const ext = path.extname(entry.name).toLowerCase();
        return (config.includeExtensions || DEFAULT_CONFIG.includeExtensions).includes(ext);
    });

    if (fileEntries.length === 0) {
        console.log(`No rule files found in ${owner}/${repo}${folder ? '/' + folder : ''}.`);
        return;
    }

    ensureDir(destDir);

    let fetchedCount = 0;
    let skippedCount = 0;

    for (const entry of fileEntries) {
        const destPath = path.join(destDir, entry.name);
        const rel = relativeToRoot(rootDir, destPath);

        if (fs.existsSync(destPath) && !force) {
            console.log(`Skipped ${entry.name}: ${rel} already exists (use --force to overwrite).`);
            skippedCount += 1;
            continue;
        }

        let content;
        try {
            content = await downloadFile(entry.download_url);
        } catch (error) {
            console.error(`Failed to download ${entry.name}: ${error.message}`);
            skippedCount += 1;
            continue;
        }

        fs.writeFileSync(destPath, content, 'utf8');
        console.log(`Fetched ${entry.name} -> ${rel}`);
        fetchedCount += 1;
    }

    console.log(`Fetch finished: ${fetchedCount} fetched, ${skippedCount} skipped.`);

    if (shouldSync) {
        syncRules(rootDir, { dryRun: false });
    }
}

async function importRulesFromGitHub(rootDir, repoArg, { force, ref, rulesDir, config }) {
    const parsed = parseGitHubRef(repoArg);
    if (!parsed) {
        throw new Error(`Invalid GitHub repo reference: "${repoArg}". Expected format: owner/repo`);
    }

    const { owner, repo } = parsed;
    const slug = [owner, repo].map(toSlug).join('-');

    const targetDefs = {
        copilot: { path: (config.targets && config.targets.copilot && config.targets.copilot.path) || DEFAULT_CONFIG.targets.copilot.path },
        cursor: { path: (config.targets && config.targets.cursor && config.targets.cursor.path) || DEFAULT_CONFIG.targets.cursor.path },
        claude: { path: (config.targets && config.targets.claude && config.targets.claude.path) || DEFAULT_CONFIG.targets.claude.path }
    };

    let importedCount = 0;
    let skippedCount = 0;

    for (const [source, targetDef] of Object.entries(targetDefs)) {
        const filePath = targetDef.path;
        let fileMeta;

        try {
            fileMeta = await fetchGitHubFileMeta(owner, repo, filePath, ref);
        } catch (_) {
            console.log(`Skipped ${source}: file not found in ${owner}/${repo}.`);
            skippedCount += 1;
            continue;
        }

        let raw;
        try {
            raw = await downloadFile(fileMeta.download_url);
        } catch (_) {
            console.log(`Skipped ${source}: could not download from ${owner}/${repo}.`);
            skippedCount += 1;
            continue;
        }

        const cleaned = extractImportableContent(raw);

        if (looksLikeGeneratedOpenRules(cleaned)) {
            console.log(`Skipped ${source}: appears to be generated by open-rules.`);
            skippedCount += 1;
            continue;
        }

        if (cleaned.trim().length === 0) {
            console.log(`Skipped ${source}: no importable content.`);
            skippedCount += 1;
            continue;
        }

        const outPath = path.join(rulesDir, `90-import-${slug}-${source}.md`);
        if (fs.existsSync(outPath) && !force) {
            console.log(`Skipped ${source}: ${relativeToRoot(rootDir, outPath)} already exists (use --force).`);
            skippedCount += 1;
            continue;
        }

        const output = [
            `# Imported ${toTitle(source)} Instructions from ${owner}/${repo}`,
            '',
            `Source: \`github:${owner}/${repo}/${filePath}\``,
            '',
            cleaned.trim(),
            ''
        ].join('\n');

        fs.writeFileSync(outPath, output, 'utf8');
        console.log(`Imported ${source} from ${owner}/${repo} -> ${relativeToRoot(rootDir, outPath)}`);
        importedCount += 1;
    }

    console.log(`Import from ${owner}/${repo} finished: ${importedCount} imported, ${skippedCount} skipped.`);
}

async function fetchGitHubFileMeta(owner, repo, filePath, ref) {
    const apiBase = process.env.OPEN_RULES_GITHUB_API_BASE || 'https://api.github.com';
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const url = `${apiBase}/repos/${owner}/${repo}/contents/${filePath}${refQuery}`;
    const result = await httpsGetJson(url);
    if (Array.isArray(result)) {
        throw new Error(`Expected a file but got a directory at ${filePath}`);
    }
    if (!result.download_url) {
        throw new Error(`No download_url for ${filePath}`);
    }
    return result;
}

function parseGitHubRef(input) {
    if (typeof input !== 'string' || input.trim().length === 0) {
        return null;
    }

    const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
    const parts = trimmed.split('/');

    if (parts.length < 2 || !parts[0] || !parts[1]) {
        return null;
    }

    const owner = parts[0];
    const repo = parts[1];
    const folder = parts.slice(2).join('/');

    return { owner, repo, folder };
}

function fetchGitHubDirectory(owner, repo, folder, ref) {
    const apiBase = process.env.OPEN_RULES_GITHUB_API_BASE || 'https://api.github.com';
    const folderPath = folder ? `/${folder}` : '';
    const apiPath = `/repos/${owner}/${repo}/contents${folderPath}`;
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const url = `${apiBase}${apiPath}${query}`;

    return httpsGetJson(url);
}

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        function get(targetUrl, redirects) {
            if (redirects > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            const parsed = new URL(targetUrl);
            const transport = parsed.protocol === 'http:' ? require('http') : https;
            const options = {
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                headers: {
                    'User-Agent': 'open-rules-cli',
                    Accept: '*/*'
                }
            };

            transport.get(options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    get(res.headers.location, redirects + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            }).on('error', reject);
        }

        get(url, 0);
    });
}

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === 'http:' ? require('http') : https;
        const options = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            headers: {
                'User-Agent': 'open-rules-cli',
                Accept: 'application/vnd.github+json'
            }
        };

        transport.get(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode !== 200) {
                    let message = `HTTP ${res.statusCode}`;
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed.message) {
                            message = parsed.message;
                        }
                    } catch {
                        // ignore JSON parse errors
                    }

                    reject(new Error(message));
                    return;
                }

                let data;
                try {
                    data = JSON.parse(body);
                } catch {
                    reject(new Error('Invalid JSON response from GitHub API'));
                    return;
                }

                resolve(data);
            });
        }).on('error', reject);
    });
}

function syncRules(rootDir, options = {}) {
    const { dryRun = false } = options;
    const config = loadConfig(rootDir);
    const rulesDir = path.join(rootDir, config.rulesDir);

    if (!fs.existsSync(rulesDir)) {
        throw new Error(`Rules folder not found: ${relativeToRoot(rootDir, rulesDir)}. Run \`open-rules init\` first.`);
    }

    const files = listRuleFiles(rulesDir, config)
        .map((filePath) => ({
            absPath: filePath,
            relPath: path.relative(rulesDir, filePath).replaceAll('\\\\', '/'),
            ...parseRuleFile(fs.readFileSync(filePath, 'utf8'))
        }))
        .filter((item) => item.content.length > 0)
        .sort((a, b) => a.relPath.localeCompare(b.relPath));

    const targets = normalizeTargets(config.targets);

    if (targets.length === 0) {
        console.log('No enabled targets in config. Nothing to sync.');
        return;
    }

    for (const target of targets) {
        const targetRules = files.filter((ruleFile) => isRuleEnabledForTarget(ruleFile, target.name));
        const supportsScopedRules = target.name === 'copilot' || target.name === 'cursor';
        const globalRules = supportsScopedRules
            ? targetRules.filter((ruleFile) => ruleFile.applyTo.length === 0)
            : targetRules;

        const merged = buildMergedRules(config.rulesDir, globalRules);
        const referenced = buildReferencedRules(config.rulesDir, globalRules);
        const output = renderTargetContent(target, {
            mergedRules: merged,
            referencedRules: referenced
        });
        const outPath = path.join(rootDir, target.path);

        if (dryRun) {
            console.log(`[dry-run] Would write ${relativeToRoot(rootDir, outPath)} (${output.length} chars)`);
            continue;
        }

        ensureDir(path.dirname(outPath));
        fs.writeFileSync(outPath, output, 'utf8');
        console.log(`Wrote ${relativeToRoot(rootDir, outPath)}`);

        if (supportsScopedRules) {
            const scopedRules = targetRules.filter((ruleFile) => ruleFile.applyTo.length > 0);
            syncScopedTargetFiles({
                rootDir,
                rulesDirName: config.rulesDir,
                target,
                scopedRules,
                dryRun
            });
        }
    }
}

function loadConfig(rootDir) {
    const configPath = path.join(rootDir, DEFAULT_CONFIG.rulesDir, 'config.json');

    if (!fs.existsSync(configPath)) {
        throw new Error(`Config not found at ${relativeToRoot(rootDir, configPath)}. Run \`open-rules init\` first.`);
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
        ...DEFAULT_CONFIG,
        ...parsed,
        targets: {
            ...DEFAULT_CONFIG.targets,
            ...(parsed.targets || {})
        }
    };
}

function ensureInitialized(rootDir) {
    const configPath = path.join(rootDir, DEFAULT_CONFIG.rulesDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        initProject(rootDir);
    }
}

function listRuleFiles(rulesDir, config) {
    const files = [];
    walk(rulesDir, files);

    return files.filter((filePath) => {
        const baseName = path.basename(filePath);
        if ((config.excludeFiles || []).includes(baseName)) {
            return false;
        }

        const extension = path.extname(filePath).toLowerCase();
        return (config.includeExtensions || []).includes(extension);
    });
}

function walk(currentPath, collector) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
        const abs = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
            walk(abs, collector);
        } else if (entry.isFile()) {
            collector.push(abs);
        }
    }
}

function buildMergedRules(rulesDirName, files) {
    const lines = [];

    lines.push('## Open Rules Source');
    lines.push('');
    lines.push(`Generated from \`${rulesDirName}\` files. Do not edit this section manually.`);
    lines.push('');

    if (files.length === 0) {
        lines.push('_No rule files found._');
        lines.push('');
        return lines.join('\n');
    }

    for (const file of files) {
        lines.push(`### ${file.relPath}`);
        lines.push('');
        lines.push(file.content);
        lines.push('');
    }

    return lines.join('\n');
}

function buildReferencedRules(rulesDirName, files) {
    const lines = [];

    lines.push('## Open Rules Source');
    lines.push('');
    lines.push(`Rules are stored in \`${rulesDirName}\`. Read those files directly and treat them as the source of truth.`);
    lines.push('Do not rely on copied content in this file.');
    lines.push('');

    if (files.length === 0) {
        lines.push('_No rule files found._');
        lines.push('');
        return lines.join('\n');
    }

    lines.push('### Rule files');
    lines.push('');
    for (const file of files) {
        lines.push(`- \`${rulesDirName}/${file.relPath}\``);
    }
    lines.push('');

    return lines.join('\n');
}

function parseRuleFile(rawContent) {
    const { frontmatter, body } = splitFrontmatter(rawContent);
    const metadata = parseFrontmatterMetadata(frontmatter);

    return {
        content: body.trim(),
        applyTo: normalizeStringList(metadata.applyTo),
        targets: normalizeStringList(metadata.targets)
    };
}

function splitFrontmatter(content) {
    if (!content.startsWith('---')) {
        return {
            frontmatter: '',
            body: content
        };
    }

    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
        return {
            frontmatter: '',
            body: content
        };
    }

    return {
        frontmatter: match[1],
        body: content.slice(match[0].length)
    };
}

function parseFrontmatterMetadata(frontmatter) {
    if (typeof frontmatter !== 'string' || frontmatter.trim().length === 0) {
        return {};
    }

    const result = {};
    const lines = frontmatter.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        if (/^\s*#/.test(rawLine) || rawLine.trim().length === 0) {
            continue;
        }

        const match = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!match) {
            continue;
        }

        const key = match[1];
        const inlineValue = match[2].trim();

        if (inlineValue.length === 0) {
            const listValues = [];
            let pointer = index + 1;
            while (pointer < lines.length) {
                const listMatch = lines[pointer].match(/^\s*-\s*(.*)$/);
                if (!listMatch) {
                    break;
                }

                listValues.push(parseYamlScalar(listMatch[1]));
                pointer += 1;
            }

            if (listValues.length > 0) {
                result[key] = listValues;
                index = pointer - 1;
            }
            continue;
        }

        if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
            const inner = inlineValue.slice(1, -1).trim();
            result[key] = inner.length === 0
                ? []
                : inner.split(',').map((token) => parseYamlScalar(token.trim()));
            continue;
        }

        result[key] = parseYamlScalar(inlineValue);
    }

    return result;
}

function parseYamlScalar(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        const quote = trimmed.charAt(0);
        const inner = trimmed.slice(1, -1);
        return quote === "'" ? inner.replaceAll("''", "'") : inner;
    }

    return trimmed;
}

function normalizeStringList(input) {
    if (typeof input === 'string' && input.trim().length > 0) {
        return [input.trim()];
    }

    if (Array.isArray(input)) {
        return input
            .filter((value) => typeof value === 'string' && value.trim().length > 0)
            .map((value) => value.trim());
    }

    return [];
}

function isRuleEnabledForTarget(ruleFile, targetName) {
    if (!Array.isArray(ruleFile.targets) || ruleFile.targets.length === 0) {
        return true;
    }

    return ruleFile.targets.some((target) => target.toLowerCase() === targetName.toLowerCase());
}

function syncScopedTargetFiles({ rootDir, rulesDirName, target, scopedRules, dryRun }) {
    const scopedMeta = resolveScopedOutputMeta(target);
    if (!scopedMeta) {
        return;
    }

    const outDir = path.join(rootDir, scopedMeta.directory);
    const writtenFiles = new Set();
    const usedNames = new Set();

    for (const ruleFile of scopedRules) {
        const scopedName = buildScopedRuleFileName(ruleFile.relPath, scopedMeta.extension, usedNames);
        const relOutPath = path.join(scopedMeta.directory, scopedName);
        const absOutPath = path.join(rootDir, relOutPath);
        const scopedTarget = {
            ...target,
            applyTo: ruleFile.applyTo
        };

        const output = renderTargetContent(scopedTarget, {
            mergedRules: buildMergedRules(rulesDirName, [ruleFile]),
            referencedRules: buildReferencedRules(rulesDirName, [ruleFile])
        });

        if (dryRun) {
            console.log(`[dry-run] Would write ${relativeToRoot(rootDir, absOutPath)} (${output.length} chars)`);
        } else {
            ensureDir(path.dirname(absOutPath));
            fs.writeFileSync(absOutPath, output, 'utf8');
            console.log(`Wrote ${relativeToRoot(rootDir, absOutPath)}`);
        }

        writtenFiles.add(path.resolve(absOutPath));
    }

    if (!fs.existsSync(outDir)) {
        return;
    }

    const generatedFiles = fs.readdirSync(outDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(outDir, entry.name))
        .filter((filePath) => path.basename(filePath).startsWith('open-rules-'))
        .filter((filePath) => path.basename(filePath).endsWith(scopedMeta.extension));

    for (const generatedFile of generatedFiles) {
        if (writtenFiles.has(path.resolve(generatedFile))) {
            continue;
        }

        if (dryRun) {
            console.log(`[dry-run] Would remove ${relativeToRoot(rootDir, generatedFile)}`);
        } else {
            fs.unlinkSync(generatedFile);
            console.log(`Removed ${relativeToRoot(rootDir, generatedFile)}`);
        }
    }
}

function resolveScopedOutputMeta(target) {
    const targetPathDir = path.dirname(target.path);

    if (target.name === 'copilot') {
        return {
            directory: path.join(targetPathDir, 'instructions'),
            extension: '.instructions.md'
        };
    }

    if (target.name === 'cursor') {
        return {
            directory: targetPathDir,
            extension: '.mdc'
        };
    }

    return null;
}

function buildScopedRuleFileName(relPath, extension, usedNames) {
    const noExt = relPath.replace(/\.[^.]+$/, '');
    const baseSlug = `open-rules-${noExt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rule'}`;
    let candidate = `${baseSlug}${extension}`;
    let index = 2;

    while (usedNames.has(candidate)) {
        candidate = `${baseSlug}-${index}${extension}`;
        index += 1;
    }

    usedNames.add(candidate);
    return candidate;
}

function normalizeTargets(targetsObject) {
    return Object.entries(targetsObject || {})
        .filter(([, value]) => value && value.enabled && typeof value.path === 'string' && value.path.length > 0)
        .map(([name, value]) => ({
            name,
            ...value
        }));
}

function resolveSourcePath(rootDir, config, sourceName) {
    const configured = config.targets && config.targets[sourceName];
    const fallback = DEFAULT_CONFIG.targets[sourceName];
    const selected = configured && typeof configured.path === 'string'
        ? configured.path
        : fallback && typeof fallback.path === 'string'
            ? fallback.path
            : '';

    if (selected.length === 0) {
        return '';
    }

    return path.join(rootDir, selected);
}

function extractImportableContent(rawContent) {
    const withoutFrontmatter = stripLeadingFrontmatter(rawContent);
    const lines = withoutFrontmatter.split(/\r?\n/);

    while (lines.length > 0 && lines[0].trim().length === 0) {
        lines.shift();
    }

    if (lines.length > 0 && /^#\s+(Copilot Instructions|Claude Code Instructions)$/i.test(lines[0].trim())) {
        lines.shift();
        while (lines.length > 0 && lines[0].trim().length === 0) {
            lines.shift();
        }
    }

    return lines.join('\n').trim();
}

function stripLeadingFrontmatter(content) {
    if (!content.startsWith('---')) {
        return content;
    }

    return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function looksLikeGeneratedOpenRules(content) {
    return content.includes('## Open Rules Source')
        && (
            content.includes('Do not edit this section manually.')
            || content.includes('Read those files directly and treat them as the source of truth.')
        );
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function toSlug(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'rule';
}

function toTitle(input) {
    return input
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
}

function relativeToRoot(rootDir, targetPath) {
    return path.relative(rootDir, targetPath).replaceAll('\\\\', '/') || '.';
}

module.exports = {
    main
};
