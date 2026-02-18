const { resolveRulesBody, normalizeApplyTo } = require('./helpers');

function renderCopilotTarget(target, content) {
    const rulesBody = resolveRulesBody(target, content);
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

module.exports = {
    renderCopilotTarget
};
