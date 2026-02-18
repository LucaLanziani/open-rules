const fs = require('fs');
const path = require('path');

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

    throw new Error(`Unknown command: ${command}`);
}

function printHelp() {
    console.log([
        'open-rules - consolidate AI agent rules in .open-rules and sync adapters',
        '',
        'Commands:',
        '  open-rules init                 Initialize .open-rules and config',
        '  open-rules add <rule-name>      Create a new rule file in .open-rules',
        '  open-rules sync [--dry-run]     Generate adapter files for enabled targets',
        '  open-rules help                 Show this help',
        ''
    ].join('\n'));
}

function initProject(rootDir) {
    const configPath = path.join(rootDir, DEFAULT_CONFIG.rulesDir, 'config.json');
    const readmePath = path.join(rootDir, DEFAULT_CONFIG.rulesDir, 'README.md');
    const coreRulePath = path.join(rootDir, DEFAULT_CONFIG.rulesDir, '00-core.md');

    ensureDir(path.dirname(configPath));

    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
        console.log(`Created ${relativeToRoot(rootDir, configPath)}`);
    }

    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, [
            '# .open-rules',
            '',
            'Store reusable instructions here. One file = one rule module.',
            'Then run `open-rules sync` to generate adapter files for each target.',
            ''
        ].join('\n'), 'utf8');
        console.log(`Created ${relativeToRoot(rootDir, readmePath)}`);
    }

    if (!fs.existsSync(coreRulePath)) {
        fs.writeFileSync(coreRulePath, [
            '# Core behavior',
            '',
            '- Be precise and concise.',
            '- Ask clarifying questions only when needed.',
            '- Prefer safe defaults and explicit assumptions.',
            ''
        ].join('\n'), 'utf8');
        console.log(`Created ${relativeToRoot(rootDir, coreRulePath)}`);
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
            content: fs.readFileSync(filePath, 'utf8').trim()
        }))
        .filter((item) => item.content.length > 0)
        .sort((a, b) => a.relPath.localeCompare(b.relPath));

    const merged = buildMergedRules(config.rulesDir, files);
    const referenced = buildReferencedRules(config.rulesDir, files);
    const targets = normalizeTargets(config.targets);

    if (targets.length === 0) {
        console.log('No enabled targets in config. Nothing to sync.');
        return;
    }

    for (const target of targets) {
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

function normalizeTargets(targetsObject) {
    return Object.entries(targetsObject || {})
        .filter(([, value]) => value && value.enabled && typeof value.path === 'string' && value.path.length > 0)
        .map(([name, value]) => ({
            name,
            ...value
        }));
}

function renderTargetContent(target, content) {
    const targetName = target.name;
    const sourceMode = target.sourceMode === 'reference' ? 'reference' : 'embed';
    const rulesBody = sourceMode === 'reference' ? content.referencedRules : content.mergedRules;

    if (targetName === 'cursor') {
        const frontmatter = [
            '---',
            'description: Open Rules (generated)',
            'alwaysApply: true'
        ];

        const applyTo = normalizeApplyTo(target.applyTo);
        if (applyTo.length > 0) {
            frontmatter.push(`applyTo: ${applyTo}`);
        }

        return [
            ...frontmatter,
            '---',
            '',
            rulesBody,
            ''
        ].join('\n');
    }

    if (targetName === 'copilot') {
        const applyTo = normalizeApplyTo(target.applyTo);
        const frontmatter = applyTo.length > 0
            ? [
                '---',
                `applyTo: ${applyTo}`,
                '---',
                ''
            ]
            : [];

        return [
            ...frontmatter,
            '# Copilot Instructions',
            '',
            rulesBody,
            ''
        ].join('\n');
    }

    if (targetName === 'claude') {
        return [
            '# Claude Code Instructions',
            '',
            rulesBody,
            ''
        ].join('\n');
    }

    return [
        `# ${toTitle(targetName)} Instructions`,
        '',
        rulesBody,
        ''
    ].join('\n');
}

function normalizeApplyTo(input) {
    if (typeof input === 'string' && input.trim().length > 0) {
        return toYamlQuotedString(input.trim());
    }

    if (Array.isArray(input)) {
        const cleaned = input
            .filter((item) => typeof item === 'string' && item.trim().length > 0)
            .map((item) => toYamlQuotedString(item.trim()));

        if (cleaned.length > 0) {
            return `[${cleaned.join(', ')}]`;
        }
    }

    return '';
}

function toYamlQuotedString(value) {
    return `'${value.replaceAll("'", "''")}'`;
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
